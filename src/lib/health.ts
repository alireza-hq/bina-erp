import { sql } from "drizzle-orm";
import { db } from "@/db";
import { operationalLog } from "@/lib/operational-log";

let pending: Promise<boolean> | undefined;
let checkedAt = 0;
let healthy = false;
export async function healthResponse() {
  if (Date.now() - checkedAt > 5000) {
    if (!pending) {
      pending = Promise.resolve(db.execute(sql`SELECT 1`))
        .then(() => true)
        .catch((error) => {
          operationalLog("health.database_unavailable", error);
          return false;
        })
        .then((result) => {
          healthy = result;
          checkedAt = Date.now();
          pending = undefined;
          return result;
        });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 3000);
    });
    try {
      healthy = await Promise.race([pending, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
  return Response.json(
    { status: healthy ? "ok" : "unavailable" },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
