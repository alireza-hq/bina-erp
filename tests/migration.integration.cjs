const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");
const postgres = require("postgres");
require("@next/env").loadEnvConfig(process.cwd());
test("upgrade committed Phase 7 database preserves users, sessions, work, archive and audit", async () => {
  const scratch = `upgrade_${randomUUID().replaceAll("-", "")}`;
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries;
  const migrate = async (tx, e) => {
    const source = readFileSync(`drizzle/${e.tag}.sql`, "utf8")
      .replaceAll('"public"', `"${scratch}"`)
      .replaceAll('"legacy_letter_list"', `"${scratch}_legacy"`)
      .replaceAll('"workflow_archive"', `"${scratch}_archive"`);
    for (const statement of source.split("--> statement-breakpoint"))
      if (statement.trim()) await tx.unsafe(statement);
  };
  let created = false;
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`CREATE SCHEMA "${scratch}"`);
      await tx.unsafe(`SET LOCAL search_path TO "${scratch}",pg_catalog`);
      for (const e of journal.filter((e) => e.idx < 8)) await migrate(tx, e);
    });
    created = true;
    await sql.unsafe(`SET search_path TO "${scratch}",pg_catalog`);
    const [user] =
      await sql`INSERT INTO users(ldap_id,username,display_name,email,employee_code,role) VALUES ('CN=legacy','legacy','Old Name','old@example.invalid','E1','IT_ADMIN') RETURNING id`;
    const [d] = await sql`INSERT INTO departments(name) VALUES ('Legacy department') RETURNING id`;
    await sql`UPDATE users SET department_id=${d.id} WHERE id=${user.id}`;
    const [p] =
      await sql`INSERT INTO projects(code,name) VALUES ('L','Legacy project') RETURNING id`;
    const [f] =
      await sql`INSERT INTO project_files(project_id,code,name) VALUES (${p.id},'PID','Legacy file') RETURNING id`;
    const [w] =
      await sql`INSERT INTO work_entries(employee_id,work_date,project_id,project_file_id,description,man_hours) VALUES (${user.id},'2026-01-05',${p.id},${f.id},'legacy detail',1.25) RETURNING *`;
    await sql`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES (${user.id},'preserved',now()+interval '1 day')`;
    await sql`INSERT INTO reporting_periods(week_start,week_end,status,locked_at,locked_by) VALUES ('2026-01-03','2026-01-09','LOCKED',now(),${user.id})`;
    const [audit] =
      await sql`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,new_data) VALUES (${user.id},'WORK_ENTRY_CREATED','WORK_ENTRY',${w.id},' {"legacy":true}') RETURNING *`;
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${scratch}",pg_catalog`);
      await migrate(
        tx,
        journal.find((e) => e.idx === 8),
      );
    });
    const [entry] = await sql`SELECT * FROM work_entries WHERE id=${w.id}`;
    for (const key of [
      "id",
      "employee_id",
      "work_date",
      "project_id",
      "description",
      "man_hours",
      "created_at",
      "updated_at",
    ])
      assert.deepEqual(entry[key], w[key]);
    assert.equal(entry.status, "APPROVED");
    assert.ok(entry.report_id);
    assert.equal((await sql`SELECT count(*)::int AS n FROM work_entry_approvals`)[0].n, 0);
    assert.equal(
      (await sql`SELECT * FROM users WHERE id=${user.id}`)[0].profile_completed_at,
      null,
    );
    assert.equal(
      (await sql`SELECT token_hash FROM sessions WHERE user_id=${user.id}`)[0].token_hash,
      "preserved",
    );
    assert.deepEqual((await sql`SELECT * FROM audit_logs WHERE id=${audit.id}`)[0], audit);
    assert.equal(
      (
        await sql.unsafe(`SELECT email FROM "${scratch}_archive".user_retired_fields WHERE id=$1`, [
          user.id,
        ])
      )[0].email,
      "old@example.invalid",
    );
    assert.equal(
      (await sql.unsafe(`SELECT count(*)::int AS n FROM "${scratch}_archive".project_files`))[0].n,
      1,
    );
    assert.equal(
      (
        await sql.unsafe(
          `SELECT project_file_id FROM "${scratch}_archive".work_entry_project_files WHERE id=$1`,
          [w.id],
        )
      )[0].project_file_id,
      f.id,
    );
    assert.equal(
      (await sql.unsafe(`SELECT status FROM "${scratch}_archive".reporting_periods`))[0].status,
      "LOCKED",
    );
    assert.equal(
      (await sql`SELECT is_active FROM report_types WHERE id=${entry.report_id}`)[0].is_active,
      false,
    );
    assert.equal(
      (
        await sql`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=${scratch} AND column_name IN ('employee_code','email','project_file_id')`
      )[0].n,
      0,
    );
  } finally {
    if (created)
      for (const name of [scratch, `${scratch}_legacy`, `${scratch}_archive`]) {
        if (!/^upgrade_[a-f0-9]{32}(_legacy|_archive)?$/.test(name))
          throw Error("Invalid fixture schema");
        await sql.unsafe(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
      }
    await sql.end();
  }
});
