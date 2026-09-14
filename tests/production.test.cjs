const { test } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers.cjs");

test("production configuration validates names only, requires TLS and explicit exceptions", () => {
  const { validateRuntimeConfig } = load("src/lib/runtime-config.ts");
  const env = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:secret@db/app",
    LDAP_URL: "ldaps://directory",
    LDAP_BASE_DN: "DC=test",
    LDAP_DOMAIN: "test",
    JWT_SECRET: "x".repeat(40),
    APP_ORIGIN: "https://reports.test",
  };
  assert.doesNotThrow(() => validateRuntimeConfig(env));
  for (const change of [
    { JWT_SECRET: "short" },
    { DATABASE_URL: "bad-secret" },
    { APP_ORIGIN: "https://user:secret@reports.test" },
    { APP_ORIGIN: "http://reports.test" },
    { LDAP_URL: "ldap://directory" },
    { DB_POOL_MAX: "1000" },
    { TRUST_PROXY: "yes" },
  ]) {
    assert.throws(
      () => validateRuntimeConfig({ ...env, ...change }),
      (error) =>
        !error.message.includes("bad-secret") &&
        error.message.includes("Invalid runtime configuration"),
    );
  }
  assert.doesNotThrow(() =>
    validateRuntimeConfig({
      ...env,
      APP_ORIGIN: "http://localhost:3000",
      ALLOW_INSECURE_HTTP: "true",
      LDAP_URL: "ldap://test",
      ALLOW_INSECURE_LDAP: "true",
    }),
  );
});

test("throttle reserves concurrent attempts, canonicalizes accounts, expires and resets safely", () => {
  const { LoginThrottle } = load("src/lib/login-throttle.ts");
  let now = 1000;
  const throttle = new LoginThrottle(() => now);
  const request = new Request("http://localhost", { headers: { "x-forwarded-for": "spoofed" } });
  const held = ["employee", "EMPLOYEE", "DOMAIN\\employee", "employee@test", "employee"].map(
    (name) => throttle.reserve(request, name),
  );
  assert.ok(held.every((value) => value.finish));
  assert.equal(throttle.reserve(request, "employee").retryAfter, 900);
  held.forEach((value) => value.finish("failure"));
  now += 900001;
  const retry = throttle.reserve(request, "employee");
  assert.ok(retry.finish);
  retry.finish("success");
  retry.finish("success");
  for (let i = 0; i < 10; i++) throttle.reserve(request, "employee").finish("unavailable");
  assert.ok(throttle.reserve(request, "employee").finish);
  const concurrent = new LoginThrottle(() => now);
  const jobs = Array.from({ length: 16 }, (_, n) => concurrent.reserve(request, `user${n}`));
  assert.equal(concurrent.reserve(request, "another").retryAfter, 30);
  jobs.forEach((job) => job.finish("success"));
  assert.ok(concurrent.reserve(request, "another").finish);
});

test("production origin rejects request-host and forwarded-header spoofing", () => {
  const old = { NODE_ENV: process.env.NODE_ENV, APP_ORIGIN: process.env.APP_ORIGIN };
  try {
    process.env.NODE_ENV = "production";
    process.env.APP_ORIGIN = "https://reports.test";
    const auth = load("src/lib/auth.ts", { "@/db": { db: {} } });
    const req = (origin) =>
      new Request("http://attacker.test/api", {
        headers: { origin, "x-forwarded-host": "reports.test", "x-forwarded-proto": "https" },
      });
    assert.equal(auth.hasSameOrigin(req("http://attacker.test")), false);
    assert.equal(auth.hasSameOrigin(req("https://reports.test")), true);
    const { secureSessionCookie } = load("src/lib/runtime-config.ts");
    assert.equal(secureSessionCookie(), true);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("bounded JSON rejects large/chunked bodies and wrong media types before validation", async () => {
  const { parseJson } = load("src/lib/api.ts");
  const { loginSchema } = load("src/lib/validation.ts");
  const request = (body) =>
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  assert.equal(
    (await parseJson(request('"' + "x".repeat(20000) + '"'), loginSchema)).error.status,
    413,
  );
  assert.equal((await parseJson(request("bad"), loginSchema)).error.status, 400);
  assert.equal(
    (await parseJson(new Request("http://localhost", { method: "POST", body: "{}" }), loginSchema))
      .error.status,
    415,
  );
});

test("LDAP failure classes and malformed identities never expose upstream details", async () => {
  Object.assign(process.env, {
    LDAP_URL: "ldaps://test",
    LDAP_BASE_DN: "DC=test",
    LDAP_DOMAIN: "test",
  });
  let failure;
  let entry = {};
  let unbound = 0;
  class Client {
    constructor(options) {
      assert.equal(options.timeout, 8000);
      assert.equal(options.connectTimeout, 5000);
      assert.equal(options.tlsOptions.rejectUnauthorized, true);
    }
    async bind() {
      if (failure) throw failure;
    }
    async search(_, options) {
      assert.equal(options.timeLimit, 8);
      return { searchEntries: [entry] };
    }
    async unbind() {
      unbound++;
    }
  }
  const ldap = load("src/lib/ldap.ts", {
    ldapts: { Client, escapeFilter: require("ldapts").escapeFilter },
  });
  for (const [error, kind] of [
    [{ code: 49, message: "private password" }, "credentials"],
    [{ code: "ECONNREFUSED", message: "secret-host" }, "unavailable"],
    [{ code: "ENOTFOUND" }, "unavailable"],
    [{ name: "TimeoutError" }, "unavailable"],
    [undefined, "identity"],
  ]) {
    failure = error;
    await assert.rejects(
      () => ldap.authenticateDirectoryUser("test", "secret"),
      (err) => err.kind === kind && !err.message.includes("secret"),
    );
  }
  assert.equal(unbound, 5);
});

test("operational logs contain event/code only; health failure is minimal and cached", async () => {
  const output = [];
  const logger = load("src/lib/operational-log.ts", {});
  const original = console.error;
  console.error = (text) => output.push(text);
  try {
    logger.operationalLog("test.failure", {
      code: "ECONNREFUSED",
      message: "password session-token",
      stack: "private",
      cause: { query: "private" },
    });
    assert.deepEqual(Object.keys(JSON.parse(output[0])).sort(), ["code", "event", "timestamp"]);
    assert.ok(!output[0].includes("password"));
    let calls = 0;
    const health = load("src/lib/health.ts", {
      "@/db": {
        db: {
          execute: async () => {
            calls++;
            throw new Error("private database");
          },
        },
      },
    });
    for (let i = 0; i < 2; i++) {
      const response = await health.healthResponse();
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { status: "unavailable" });
    }
    assert.equal(calls, 1);
  } finally {
    console.error = original;
  }
});

test("export concurrency is bounded and slots release after success or failure", async () => {
  const waiting = [];
  let fail = false;
  const api = load("src/lib/report-export-api.ts", {
    "@/lib/auth": { requireApiRole: async () => ({ user: { role: "BUSINESS_ADMIN" } }) },
    "@/lib/business-reports": {
      getBusinessReportExport: () =>
        fail
          ? Promise.reject(new Error("private SQL"))
          : new Promise((resolve) => waiting.push(resolve)),
    },
    "@/lib/report-workbook": {
      createReportWorkbook: async () => Buffer.from("test"),
      WorkbookValueError: class extends Error {},
    },
  });
  const request = () => new Request("http://localhost/api/admin/reports/export?mode=details");
  const a = api.reportExportApi(request()),
    b = api.reportExportApi(request());
  await new Promise((resolve) => setImmediate(resolve));
  const rejected = await api.reportExportApi(request());
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get("retry-after"), "30");
  waiting.splice(0).forEach((resolve) => resolve({}));
  assert.equal((await a).status, 200);
  assert.equal((await b).status, 200);
  fail = true;
  for (let n = 0; n < 3; n++) assert.equal((await api.reportExportApi(request())).status, 500);
});
