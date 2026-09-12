import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
const base = process.env.SMOKE_BASE_URL || "http://localhost:3100";
const request = (path, options = {}) => fetch(`${base}${path}`, { redirect: "manual", ...options });
let response = await request("/dashboard");
assert.equal(response.status, 307);
assert.equal(response.headers.get("location"), "/login");
response = await request("/login");
assert.equal(response.status, 200);
assert.match(await response.text(), /autocomplete="current-password"/i);
for (const path of [
  "/admin",
  "/projects/test",
  "/api/files/test",
  "/api/admin/permissions",
  "/api/projects/test/letters",
  "/api/projects/test/sheets",
]) {
  assert.equal((await request(path)).status, 404, path);
}
const post = (body, origin = base) => ({
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
assert.equal((await request("/api/auth/login", post({ username: "", password: "" }))).status, 400);
assert.equal((await request("/api/auth/login", post({}, "https://other.example"))).status, 403);
assert.equal((await request("/api/auth/logout", { method: "GET" })).status, 405);
assert.equal(
  (await request("/api/admin/users/test", { ...post({ role: "IT_ADMIN" }), method: "PATCH" }))
    .status,
  401,
);
console.log("HTTP login, protected dashboard/API, origin checks and removed routes: PASS");

// Explicit opt-in: a unique temporary user/session validates real DB-backed requests.
// This does not claim to validate a live LDAP login. No existing account is touched.
if (process.argv.includes("--authenticated")) {
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  const id = randomUUID();
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  const signature = createHmac("sha256", process.env.JWT_SECRET).update(raw).digest("base64url");
  const cookie = `bina_session=${raw}.${signature}`;
  try {
    await sql.begin(async (tx) => {
      await tx`insert into public.users (id, ldap_id, username, display_name) values (${id}, ${`phase0-test:${id}`}, ${`phase0-test-${id}`}, 'Phase 0 smoke test')`;
      await tx`insert into public.sessions (user_id, token_hash, expires_at) values (${id}, ${hash}, ${new Date(Date.now() + 60_000)})`;
    });
    response = await request("/dashboard", { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Phase 0 smoke test/);
    assert.match(html, /زیرساخت سامانه آماده است/);
    assert.equal(
      (await request("/login", { headers: { cookie } })).headers.get("location"),
      "/dashboard",
    );
    response = await request("/api/auth/logout", {
      method: "POST",
      headers: { cookie, origin: base },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /bina_session=;/);
    const [row] =
      await sql`select count(*)::int as count from public.sessions where user_id = ${id}`;
    assert.equal(row.count, 0);
    assert.equal(
      (await request("/dashboard", { headers: { cookie } })).headers.get("location"),
      "/login",
    );
    console.log(
      "HTTP authenticated shell and logout/replay rejection using PostgreSQL fixture: PASS",
    );
  } finally {
    await sql`delete from public.users where id = ${id}`;
    await sql.end();
  }
}
