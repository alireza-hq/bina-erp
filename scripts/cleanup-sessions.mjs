import nextEnv from "@next/env";
import postgres from "postgres";
import { cleanupExpiredSessions } from "./lib/session-maintenance.mjs";
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
let sql;
try {
  sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    connect_timeout: 10,
    connection: { statement_timeout: 30000 },
  });
  let deleted = 0;
  for (let batch = 0; batch < 20; batch++) {
    const count = await cleanupExpiredSessions(sql);
    deleted += count;
    if (count < 5000) break;
  }
  console.log(JSON.stringify({ event: "sessions.cleanup", deleted }));
} catch {
  console.error(JSON.stringify({ event: "sessions.cleanup_failed" }));
  process.exitCode = 1;
} finally {
  await sql?.end();
}
