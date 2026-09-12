import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
const scratch = `phase0_${randomUUID().replaceAll("-", "")}`;
const archive = `${scratch}_archive`;
const rollback = new Error("validation rollback");
try {
  await sql.begin(async (tx) => {
    await tx.unsafe(`CREATE SCHEMA "${scratch}"`);
    await tx.unsafe(`SET LOCAL search_path TO "${scratch}", pg_catalog`);
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    for (const entry of journal.entries) {
      const source = await readFile(`drizzle/${entry.tag}.sql`, "utf8");
      const isolated = source
        .replaceAll('"public"', `"${scratch}"`)
        .replaceAll('"legacy_letter_list"', `"${archive}"`);
      for (const statement of isolated.split("--> statement-breakpoint")) {
        if (statement.trim()) await tx.unsafe(statement);
      }
      if (entry.idx === 2) {
        await tx`insert into users (ldap_id, username, display_name, role) values ('CN=RealAdmin,DC=test', 'migration-admin', 'Admin', 'admin'), ('CN=Employee,DC=test', 'migration-employee', 'Employee', 'user')`;
        await tx`insert into projects (id, name, code) values ('00000000-0000-4000-8000-000000000001', 'Migration test', 'phase0')`;
        await tx`insert into sheets (id, project_id, name) values ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'Test')`;
        await tx`insert into letters (id, project_id, sheet_id, letter_date, sender, recipient, subject, created_by) select '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '2026-01-01', 'Test', 'Test', 'Test', id from users limit 1`;
        await tx`insert into files (letter_id, kind, original_name, mime_type, size, data) values ('00000000-0000-4000-8000-000000000003', 'letter', 'test.txt', 'text/plain', 4, ${Buffer.from("test")})`;
        await tx`insert into project_permissions (project_id, user_id, permission) select '00000000-0000-4000-8000-000000000001', id, 'write' from users limit 1`;
        await tx`insert into sessions (user_id, token_hash, expires_at) select id, 'migration-test-hash', now() + interval '1 day' from users limit 1`;
      }
    }
    for (const table of ["files", "letters", "project_permissions", "sheets", "projects"]) {
      const [row] = await tx.unsafe(`SELECT count(*)::int AS count FROM "${archive}"."${table}"`);
      assert.equal(row.count, 1, `${table} data preserved`);
    }
    const [session] =
      await tx`select count(*)::int as count from sessions inner join users on users.id = sessions.user_id`;
    assert.equal(session.count, 1);
    const tables =
      await tx`select table_name from information_schema.tables where table_schema = ${scratch} order by table_name`;
    assert.deepEqual(
      tables.map((row) => row.table_name),
      ["departments", "project_files", "projects", "sessions", "users"],
    );
    // The archive's FK to users remains valid after moving the tables.
    const [owner] = await tx.unsafe(
      `SELECT count(*)::int AS count FROM "${archive}".letters l JOIN "${scratch}".users u ON u.id = l.created_by`,
    );
    assert.equal(owner.count, 1);
    const migrated =
      await tx`select username, role from users where username in ('migration-admin', 'migration-employee') order by username`;
    assert.deepEqual(
      migrated.map((u) => u.role),
      ["IT_ADMIN", "EMPLOYEE"],
    );
    const [pending] = await tx`select role from users where ldap_id like 'pending:%'`;
    assert.equal(pending.role, "EMPLOYEE");
    throw rollback;
  });
} catch (error) {
  if (error === rollback)
    console.log(
      "Migration chain and archived data/auth preservation: PASS (isolated schemas rolled back)",
    );
  else {
    console.error("Migration validation failed:", error.code || error.message);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}
