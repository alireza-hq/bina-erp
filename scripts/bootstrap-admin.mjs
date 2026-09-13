import nextEnv from "@next/env";
import postgres from "postgres";
nextEnv.loadEnvConfig(process.cwd());
const username = process.argv[2]?.trim().toLowerCase();
if (!username || !/^[^\s\\@]+$/.test(username)) {
  console.error("Usage: pnpm admin:promote <existing-canonical-ldap-username>");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(8172401)`;
    const rows =
      await tx`select id, role from public.users where username = ${username} and active = true and ldap_id not like 'pending:%' for update`;
    if (rows.length !== 1)
      throw new Error("No active, LDAP-provisioned user matched. Log in once before promotion.");
    if (rows[0].role !== "IT_ADMIN") {
      await tx`update public.users set role='IT_ADMIN', updated_at=now() where id=${rows[0].id}`;
      await tx`insert into public.audit_logs (actor_user_id,action,entity_type,entity_id,old_data,new_data) values (null,'USER_ROLE_CHANGED','USER',${rows[0].id},${tx.json({ role: rows[0].role })},${tx.json({ role: "IT_ADMIN", source: "admin:promote operator command" })})`;
    }
  });
  console.log("IT_ADMIN promotion completed for the explicitly selected account.");
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
