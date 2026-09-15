import nextEnv from "@next/env";
import postgres from "postgres";
nextEnv.loadEnvConfig(process.cwd());
let sql;
try {
  if (!process.env.DATABASE_URL) throw Error("config");
  sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(8172403)`;
    await tx`INSERT INTO departments (name,code,is_active) SELECT 'واحد نمونه','SAMPLE',false WHERE NOT EXISTS (SELECT 1 FROM departments WHERE name='واحد نمونه')`;
  });
  const rows = await sql`SELECT id,name,is_active FROM departments WHERE name='واحد نمونه'`;
  console.log("Sample department (existing records unchanged):", JSON.stringify(rows));
} catch {
  console.error("Sample seed failed; check DATABASE_URL and migrations.");
  process.exitCode = 1;
} finally {
  await sql?.end();
}
