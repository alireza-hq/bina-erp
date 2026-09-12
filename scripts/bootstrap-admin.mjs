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
    const rows = await tx`update public.users set role = 'IT_ADMIN', updated_at = now()
      where username = ${username} and active = true and ldap_id not like 'pending:%'
      returning id`;
    if (rows.length !== 1)
      throw new Error("No active, LDAP-provisioned user matched. Log in once before promotion.");
  });
  console.log("IT_ADMIN promotion completed for the explicitly selected account.");
} catch (error) {
  console.error(error.code || error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
