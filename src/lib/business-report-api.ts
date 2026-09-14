import { ZodError } from "zod";
import { requireApiRole } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { REPORT_ROLES, parseBusinessReportQuery, queryRecord } from "@/lib/business-report-query";
import { getBusinessReport, getReportFilterOptions } from "@/lib/business-reports";
export async function businessReportApi(request: Request, options = false) {
  try {
    const actor = await requireApiRole(request, ...REPORT_ROLES);
    if ("error" in actor) return actor.error;
    const input = queryRecord(new URL(request.url).searchParams);
    const data = options
      ? await getReportFilterOptions(input)
      : await getBusinessReport(parseBusinessReportQuery(input));
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (!(error instanceof ZodError)) operationalLog("report.failed", error);
    return jsonError(
      error instanceof ZodError
        ? error.issues[0]?.message || "فیلتر نامعتبر است"
        : "گزارش دریافت نشد. دوباره تلاش کنید.",
      error instanceof ZodError ? 400 : 500,
    );
  }
}
import { operationalLog } from "@/lib/operational-log";
