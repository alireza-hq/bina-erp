import nextEnv from "@next/env";
import postgres from "postgres";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  await sql`select 1`;
  await sql`select id, week_start, week_end, status, locked_by, locked_at from public.reporting_periods limit 0`;
  await sql`select id, actor_user_id, action, entity_type, entity_id, old_data, new_data, created_at from public.audit_logs limit 0`;
  await sql`select id, ldap_id, username, display_name, email, role, active, department_id, employee_code, last_login_at, created_at, updated_at from public.users limit 0`;
  await sql`select id, token_hash, user_id, expires_at, created_at from public.sessions limit 0`;
  await sql`select id, name, code, is_active, created_at, updated_at from public.departments limit 0`;
  await sql`select id, name, code, description, is_active, created_at, updated_at from public.projects limit 0`;
  await sql`select id, project_id, name, code, description, is_active, created_at, updated_at from public.project_files limit 0`;
  await sql`select id, employee_id, work_date, project_id, project_file_id, description, man_hours, created_at, updated_at from public.work_entries limit 0`;
  const roles =
    await sql`select enumlabel from pg_enum join pg_type on pg_type.oid = enumtypid join pg_namespace on pg_namespace.oid = typnamespace where typname = 'user_role' and nspname = 'public' order by enumsortorder`;
  if (
    JSON.stringify(roles.map((row) => row.enumlabel)) !==
    JSON.stringify(["EMPLOYEE", "BUSINESS_ADMIN", "IT_ADMIN"])
  )
    throw new Error("Apply Phase 1 migrations before using this application");
  console.log("PostgreSQL connection, roles and Phase 5 schema: PASS");
} catch (error) {
  console.error("PostgreSQL validation failed:", error.code || error.name);
  process.exitCode = 1;
} finally {
  await sql.end();
}
