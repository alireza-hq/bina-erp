import { ZodError } from "zod";
import { requireApiRole } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { queryRecord } from "@/lib/business-report-query";
import { parseAuditQuery } from "@/lib/audit-query";
import { getAuditLogs } from "@/lib/audit-viewer";
export async function auditApi(request: Request) {
  try {
    const actor = await requireApiRole(request, "IT_ADMIN");
    if ("error" in actor) return actor.error;
    const data = await getAuditLogs(
      parseAuditQuery(queryRecord(new URL(request.url).searchParams)),
    );
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (!(error instanceof ZodError)) operationalLog("audit.query_failed", error);
    return jsonError(
      error instanceof ZodError ? error.issues[0].message : "رویدادها دریافت نشد",
      error instanceof ZodError ? 400 : 500,
    );
  }
}
import { operationalLog } from "@/lib/operational-log";
