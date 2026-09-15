const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { fixture } = require("./workflow-fixture.cjs");
test("operator sample seed is idempotent and explicit profile bootstrap is audited", async () => {
  const f = await fixture();
  try {
    const run = (file, args = []) =>
      spawnSync(process.execPath, [file, ...args], {
        env: { ...process.env, DATABASE_URL: f.url },
        encoding: "utf8",
        windowsHide: true,
        timeout: 15000,
      });
    for (let n = 0; n < 2; n++) {
      const r = run("scripts/seed-department.mjs");
      assert.equal(r.status, 0, r.stderr);
    }
    const rows = await f.client`SELECT * FROM departments WHERE name='واحد نمونه'`;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].is_active, false);
    assert.equal(rows[0].manager_user_id, null);
    const denied = run("scripts/bootstrap-profile.mjs", ["employee", "مدیر نمونه", rows[0].id]);
    assert.equal(denied.status, 1);
    for (let n = 0; n < 2; n++) {
      const r = run("scripts/bootstrap-profile.mjs", ["it", "مدیر نمونه", rows[0].id]);
      assert.equal(r.status, 0, r.stderr);
    }
    const [person] = await f.client`SELECT * FROM users WHERE id=${f.people.it.id}`;
    assert.equal(person.display_name, "مدیر نمونه");
    assert.equal(person.department_id, rows[0].id);
    assert.ok(person.profile_completed_at);
    const [department] = await f.client`SELECT * FROM departments WHERE id=${rows[0].id}`;
    assert.equal(department.manager_user_id, person.id);
    assert.equal(department.is_active, true);
    assert.equal(
      (
        await f.client`SELECT count(*)::int AS n FROM audit_logs WHERE new_data->>'source'='profile:bootstrap'`
      )[0].n,
      2,
    );
  } finally {
    await f.close();
  }
});
