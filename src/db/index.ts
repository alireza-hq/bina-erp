import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
const globalDatabase = globalThis as unknown as { binaSql?: ReturnType<typeof postgres> };
const client =
  globalDatabase.binaSql ??
  postgres(process.env.DATABASE_URL, {
    max: Number(process.env.DB_POOL_MAX || 10),
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: {
      statement_timeout: 60000,
      lock_timeout: 15000,
      idle_in_transaction_session_timeout: 60000,
    },
  });
if (process.env.NODE_ENV !== "production") globalDatabase.binaSql = client;
export const db = drizzle(client, { schema });
