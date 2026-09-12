import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  await sql`select 1`;
  await sql`select id, ldap_id, username, display_name, email, role, active, created_at, updated_at from public.users limit 0`;
  await sql`select id, token_hash, user_id, expires_at, created_at from public.sessions limit 0`;
  console.log("PostgreSQL connection and authentication columns: PASS");
} catch (error) {
  console.error("PostgreSQL validation failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await sql.end();
}
