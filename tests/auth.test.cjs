const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { load } = require("./helpers.cjs");

function fixture() {
  process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
  const jar = new Map();
  const rows = [];
  const user = {
    id: "user-1",
    username: "employee",
    displayName: "Employee",
    isActive: true,
    role: "EMPLOYEE",
  };
  const schema = {
    sessions: { tokenHash: "tokenHash", userId: "userId", expiresAt: "expiresAt" },
    users: { id: "id", isActive: "isActive", ldapId: "ldapId", username: "username" },
  };
  const ops = {
    eq: (key, value) => (row) => row[key] === value,
    gt: (key, value) => (row) => row[key] > value,
    and:
      (...conditions) =>
      (row) =>
        conditions.every((fn) => fn(row)),
    or:
      (...conditions) =>
      (row) =>
        conditions.some((fn) => fn(row)),
  };
  const db = {
    transaction: (fn) => fn(db),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({
      where: async (condition) => {
        for (let i = rows.length - 1; i >= 0; i--) if (condition(rows[i])) rows.splice(i, 1);
      },
    }),
    insert: () => ({ values: async (row) => rows.push(row) }),
    select: () => ({
      from: (table) =>
        table === schema.users
          ? { where: () => ({ for: async () => [user] }) }
          : {
              innerJoin: () => ({
                where: (condition) => ({
                  limit: async () =>
                    rows
                      .filter((row) => condition({ ...row, isActive: user.isActive }))
                      .map(() => ({ user })),
                }),
              }),
            },
    }),
  };
  const mocks = {
    "@/db": { db },
    "@/db/schema": schema,
    "drizzle-orm": ops,
    "next/headers": {
      cookies: async () => ({
        get: (key) => jar.get(key),
        set: (key, value, options) => jar.set(key, { value, options }),
        delete: (key) => jar.delete(key),
      }),
    },
    "next/navigation": {
      redirect: (url) => {
        throw new Error(`redirect:${url}`);
      },
    },
  };
  return { auth: load("src/lib/auth.ts", mocks), mocks, jar, rows, user };
}

test("sessions: signed cookie, hashed storage, rotation, isActive/expired/tampered checks and logout", async () => {
  const { auth, jar, rows, user } = fixture();
  assert.equal(await auth.getCurrentUser(), null);
  await assert.rejects(auth.requireUser(), /redirect:\/login/);
  await auth.createSession(user.id);
  const first = jar.get("bina_session");
  assert.equal(first.options.httpOnly, true);
  assert.equal(first.options.sameSite, "strict");
  assert.equal(first.options.path, "/");
  assert.equal(
    rows[0].tokenHash,
    createHash("sha256").update(first.value.split(".")[0]).digest("hex"),
  );
  assert.equal(await auth.requireUser(), user);
  user.isActive = false;
  assert.equal(await auth.getCurrentUser(), null);
  user.isActive = true;
  rows[0].expiresAt = new Date(0);
  assert.equal(await auth.getCurrentUser(), null);
  await auth.createSession(user.id);
  assert.equal(rows.length, 1);
  assert.notEqual(jar.get("bina_session").value, first.value);
  const valid = jar.get("bina_session");
  for (const value of [first.value, "invalid", "raw.bad", valid.value + "tampered"]) {
    jar.set("bina_session", { value });
    assert.equal(await auth.getCurrentUser(), null);
  }
  jar.set("bina_session", valid);
  await auth.destroySession();
  assert.equal(rows.length, 0);
  assert.equal(jar.size, 0);
  jar.set("bina_session", valid);
  assert.equal(await auth.getCurrentUser(), null);
});

test("origin checks accept LAN and configured public origin, reject cross-origin and missing origin", () => {
  const { auth } = fixture();
  const req = (headers) => new Request("http://localhost:3000/api/auth/login", { headers });
  assert.equal(auth.hasSameOrigin(req({ origin: "http://localhost:3000" })), true);
  assert.equal(
    auth.hasSameOrigin(
      new Request("http://172.22.1.165:3000/api/auth/login", {
        headers: { origin: "http://172.22.1.165:3000" },
      }),
    ),
    true,
  );
  assert.equal(auth.hasSameOrigin(req({ origin: "https://evil.example" })), false);
  assert.equal(auth.hasSameOrigin(req({})), false);
  process.env.NEXT_PUBLIC_APP_URL = "https://internal.example";
  assert.equal(auth.hasSameOrigin(req({ origin: "https://internal.example" })), true);
  assert.equal(
    auth.hasSameOrigin(req({ origin: "https://internal.example", "sec-fetch-site": "cross-site" })),
    false,
  );
  delete process.env.NEXT_PUBLIC_APP_URL;
});

test("LDAP binds, escapes the search, maps identity and unbinds on success/failure", async () => {
  Object.assign(process.env, {
    LDAP_URL: "ldaps://directory.test",
    LDAP_DOMAIN: "test",
    LDAP_BASE_DN: "DC=test",
  });
  const calls = [];
  let reject = false;
  const actual = require("ldapts");
  class Client {
    constructor(options) {
      assert.equal(options.tlsOptions.rejectUnauthorized, true);
    }
    async bind(identity, password) {
      calls.push(["bind", identity]);
      assert.equal(password, "test-password");
      if (reject) throw new Error("invalid credentials");
    }
    async search(base, options) {
      calls.push(["search", base, options.filter]);
      return {
        searchEntries: [
          {
            distinguishedName: "CN=Employee,DC=test",
            sAMAccountName: "Employee",
            displayName: "Employee",
            mail: "employee@test",
          },
        ],
      };
    }
    async unbind() {
      calls.push(["unbind"]);
    }
  }
  const ldap = load("src/lib/ldap.ts", { ldapts: { Client, escapeFilter: actual.escapeFilter } });
  const user = await ldap.authenticateDirectoryUser("Employee", "test-password");
  assert.equal(user.username, "employee");
  assert.equal(user.ldapId, "CN=Employee,DC=test");
  assert.equal("password" in user, false);
  assert.deepEqual(calls[0], ["bind", "employee@test"]);
  assert.equal(calls.at(-1)[0], "unbind");
  await ldap.authenticateDirectoryUser("x*)(uid=*)", "test-password");
  assert.ok(calls.at(-2)[2].includes("\\2a"));
  reject = true;
  await assert.rejects(ldap.authenticateDirectoryUser("Employee", "test-password"));
  assert.equal(calls.at(-1)[0], "unbind");
});

test("login validates input, rejects bad/inactive accounts, rate limits and creates a session; logout revokes it", async () => {
  const f = fixture();
  let invalid = false;
  let calls = 0;
  const mocks = {
    ...f.mocks,
    "@/lib/auth": { ...f.auth, syncDirectoryUser: async () => f.user },
    "@/lib/ldap": {
      authenticateDirectoryUser: async () => {
        calls++;
        if (invalid) throw new Error("private LDAP error");
        return {};
      },
    },
  };
  const route = load("src/app/api/auth/login/route.ts", mocks);
  const request = (body) =>
    new Request("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await route.POST(request({ username: "", password: "" }))).status, 400);
  assert.equal(calls, 0);
  const input = { username: "employee", password: "test-password" };
  assert.equal((await route.POST(request(input))).status, 200);
  assert.equal(await f.auth.getCurrentUser(), f.user);
  const logout = load("src/app/api/auth/logout/route.ts", mocks);
  assert.equal((await logout.POST(request({}))).status, 200);
  assert.equal(await f.auth.getCurrentUser(), null);
  f.user.isActive = false;
  assert.equal((await route.POST(request(input))).status, 403);
  assert.equal(f.rows.length, 0);
  f.user.isActive = true;
  invalid = true;
  for (let i = 0; i < 5; i++) {
    const response = await route.POST(request(input));
    assert.equal(response.status, 401);
    assert.equal((await response.text()).includes("private LDAP error"), false);
  }
  assert.equal((await route.POST(request(input))).status, 429);
});

test("retained user administration API rejects anonymous and non-admin users", async () => {
  const f = fixture();
  const route = load("src/app/api/admin/users/[id]/route.ts", { ...f.mocks, "@/lib/auth": f.auth });
  const request = () =>
    new Request("http://localhost:3000/api/admin/users/other", {
      method: "PATCH",
      headers: { origin: "http://localhost:3000" },
      body: JSON.stringify({ role: "IT_ADMIN" }),
    });
  assert.equal(
    (await route.PATCH(request(), { params: Promise.resolve({ id: "other" }) })).status,
    401,
  );
  await f.auth.createSession(f.user.id);
  assert.equal(
    (await route.PATCH(request(), { params: Promise.resolve({ id: "other" }) })).status,
    403,
  );
});
