import nextEnv from "@next/env";
import postgres from "postgres";
nextEnv.loadEnvConfig(process.cwd());
const [username, name, departmentId] = process.argv.slice(2);
if (
  !username ||
  !name?.trim() ||
  name.trim().length < 2 ||
  name.trim().length > 160 ||
  !/^[-a-f0-9]{36}$/i.test(departmentId || "")
) {
  console.error(
    'Usage: pnpm profile:bootstrap <existing-it-username> "Persian full name" <department-uuid>',
  );
  process.exit(1);
}
let sql;
try {
  if (!process.env.DATABASE_URL) throw Error("config");
  sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(8172401)`;
    const [user] =
      await tx`SELECT id,username,display_name,department_id,profile_completed_at FROM users WHERE username=${username.trim().toLowerCase()} AND active AND role='IT_ADMIN' AND ldap_id NOT LIKE 'pending:%' FOR UPDATE`;
    if (!user) throw Error("user");
    const [department] =
      await tx`SELECT id,name,manager_user_id,is_active FROM departments WHERE id=${departmentId} FOR UPDATE`;
    if (!department || (department.manager_user_id && department.manager_user_id !== user.id))
      throw Error("department");
    if (department.manager_user_id !== user.id || !department.is_active) {
      await tx`UPDATE departments SET manager_user_id=${user.id},is_active=true,updated_at=now() WHERE id=${departmentId}`;
      await tx`INSERT INTO audit_logs(action,entity_type,entity_id,old_data,new_data) VALUES ('DEPARTMENT_MANAGER_CHANGED','DEPARTMENT',${departmentId},${tx.json(department)},${tx.json({ managerUserId: user.id, isActive: true, source: "profile:bootstrap" })})`;
    }
    if (
      user.display_name !== name.trim() ||
      user.department_id !== departmentId ||
      !user.profile_completed_at
    ) {
      await tx`UPDATE users SET display_name=${name.trim()},department_id=${departmentId},profile_completed_at=coalesce(profile_completed_at,now()),updated_at=now() WHERE id=${user.id}`;
      await tx`INSERT INTO audit_logs(action,entity_type,entity_id,old_data,new_data) VALUES ('PROFILE_COMPLETED','USER',${user.id},${tx.json(user)},${tx.json({ displayName: name.trim(), departmentId, source: "profile:bootstrap" })})`;
    }
  });
  console.log("Explicit initial IT profile and department-manager bootstrap completed.");
} catch {
  console.error(
    "Profile bootstrap failed. Require an existing active IT_ADMIN and a department with no different manager; check migrations/UUID.",
  );
  process.exitCode = 1;
} finally {
  await sql?.end();
}
