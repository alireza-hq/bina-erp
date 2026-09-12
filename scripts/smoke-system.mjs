import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
const root = postgres(process.env.DATABASE_URL, {
  max: 1,
  connect_timeout: 10,
  onnotice: () => {},
});
const schema = `phase1_http_${randomUUID().replaceAll("-", "")}`;
const archive = `${schema}_archive`;
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.searchParams.set("options", `-csearch_path=${schema},pg_catalog`);
const sql = postgres(testUrl.toString(), { max: 1, connect_timeout: 10 });
const base = "http://localhost:3101";
const secret = randomBytes(48).toString("hex");
let server;
let created = false;
try {
  await root.begin(async (tx) => {
    await tx.unsafe(`CREATE SCHEMA "${schema}"`);
    await tx.unsafe(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    for (const entry of JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries) {
      const source = (await readFile(`drizzle/${entry.tag}.sql`, "utf8"))
        .replaceAll('"public"', `"${schema}"`)
        .replaceAll('"legacy_letter_list"', `"${archive}"`);
      for (const statement of source.split("--> statement-breakpoint"))
        if (statement.trim()) await tx.unsafe(statement);
    }
  });
  created = true;
  const cookies = {};
  const ids = {};
  for (const role of ["EMPLOYEE", "BUSINESS_ADMIN", "IT_ADMIN"]) {
    const [user] =
      await sql`insert into users (ldap_id,username,display_name,role) values (${`CN=${role},DC=fixture`}, ${role.toLowerCase()}, ${role}, ${role}) returning id`;
    ids[role] = user.id;
    const raw = randomBytes(32).toString("base64url");
    cookies[role] =
      `bina_session=${raw}.${createHmac("sha256", secret).update(raw).digest("base64url")}`;
    await sql`insert into sessions (user_id, token_hash, expires_at) values (${user.id}, ${createHash("sha256").update(raw).digest("hex")}, ${new Date(Date.now() + 300000)})`;
  }
  server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--port", "3101", "--hostname", "127.0.0.1"],
    {
      windowsHide: true,
      stdio: "pipe",
      env: {
        ...process.env,
        DATABASE_URL: testUrl.toString(),
        JWT_SECRET: secret,
        NEXT_PUBLIC_APP_URL: base,
      },
    },
  );
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Smoke server failed to start");
    if (output.includes("Ready in")) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(output.includes("Ready in"), "Production server startup timed out");
  const request = (path, role, method = "GET", body) =>
    fetch(`${base}${path}`, {
      method,
      redirect: "manual",
      headers: {
        ...(role ? { cookie: cookies[role] } : {}),
        origin: base,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const data = async (response, status = 200) => {
    const value = await response.json();
    assert.equal(response.status, status, JSON.stringify(value));
    return value.data;
  };
  assert.equal((await request("/login")).status, 200);
  for (const path of [
    "/dashboard",
    "/system/users",
    "/system/departments",
    "/system/projects",
    `/system/projects/${randomUUID()}`,
  ]) {
    const response = await request(path);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "/login");
  }
  for (const role of ["EMPLOYEE", "BUSINESS_ADMIN"]) {
    const dashboard = await request("/dashboard", role);
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.text()).includes('href="/system/users"'), false);
    for (const path of ["/system/users", "/system/departments", "/system/projects"])
      assert.equal((await request(path, role)).headers.get("location"), "/dashboard");
  }
  for (const path of ["/api/admin/users", "/api/admin/departments", "/api/admin/projects"]) {
    assert.equal((await request(path)).status, 401);
    for (const role of ["EMPLOYEE", "BUSINESS_ADMIN"])
      assert.equal((await request(path, role)).status, 403);
    assert.equal((await request(path, "IT_ADMIN")).status, 200);
  }
  for (const path of ["/system/users", "/system/departments", "/system/projects"])
    assert.equal((await request(path, "IT_ADMIN")).status, 200);
  const department = await data(
    await request("/api/admin/departments", "IT_ADMIN", "POST", {
      name: "واحد مهندسی",
      code: "ENG",
    }),
    201,
  );
  const project = await data(
    await request("/api/admin/projects", "IT_ADMIN", "POST", {
      name: "پروژه آزمایشی",
      code: "P-001",
    }),
    201,
  );
  const file = await data(
    await request(`/api/admin/projects/${project.id}/files`, "IT_ADMIN", "POST", {
      name: "نقشه فرایند",
      code: "PID-001",
    }),
    201,
  );
  assert.equal((await request(`/system/projects/${project.id}`, "IT_ADMIN")).status, 200);
  const assigned = await data(
    await request(`/api/admin/users/${ids.EMPLOYEE}`, "IT_ADMIN", "PATCH", {
      role: "BUSINESS_ADMIN",
      departmentId: department.id,
    }),
  );
  assert.equal(assigned.role, "BUSINESS_ADMIN");
  assert.equal(assigned.departmentId, department.id);
  const off = await data(
    await request(`/api/admin/projects/${project.id}/files/${file.id}`, "IT_ADMIN", "PATCH", {
      isActive: false,
    }),
  );
  assert.equal(off.isActive, false);
  assert.equal(
    (await request(`/api/admin/projects/${project.id}`, "IT_ADMIN", "DELETE")).status,
    405,
  );
  await data(
    await request(`/api/admin/users/${ids.EMPLOYEE}`, "IT_ADMIN", "PATCH", { isActive: false }),
  );
  assert.equal((await request("/dashboard", "EMPLOYEE")).headers.get("location"), "/login");
  assert.equal((await request("/api/auth/logout", "IT_ADMIN", "POST", {})).status, 200);
  assert.equal((await request("/dashboard", "IT_ADMIN")).headers.get("location"), "/login");
  console.log(
    "Production HTTP: role-aware pages, admin APIs, master data, user assignments, deactivation and logout PASS",
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
  await sql.end();
  // Only the random schemas created by this invocation can be removed.
  if (created && /^phase1_http_[a-f0-9]{32}$/.test(schema) && archive === `${schema}_archive`) {
    await root.begin(async (tx) => {
      await tx.unsafe(`DROP SCHEMA "${archive}" CASCADE`);
      await tx.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
    });
  }
  await root.end();
}
