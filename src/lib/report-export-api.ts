import { ZodError } from "zod";
import { requireApiRole } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { REPORT_ROLES, queryRecord } from "@/lib/business-report-query";
import {
  exportFilename,
  parseReportExportQuery,
  ReportExportLimitError,
} from "@/lib/report-export-query";
import { getBusinessReportExport } from "@/lib/business-reports";
import { createReportWorkbook, WorkbookValueError } from "@/lib/report-workbook";
let activeExports = 0;
export async function reportExportApi(request: Request) {
  let reserved = false;
  try {
    const actor = await requireApiRole(request, ...REPORT_ROLES);
    if ("error" in actor) return actor.error;
    const { query, mode } = parseReportExportQuery(queryRecord(new URL(request.url).searchParams));
    if (activeExports >= 2) {
      const response = jsonError("دو خروجی در حال تولید است. کمی بعد دوباره تلاش کنید.", 429);
      response.headers.set("Retry-After", "30");
      return response;
    }
    activeExports++;
    reserved = true;
    const data = await getBusinessReportExport(query, mode);
    const workbook = await createReportWorkbook(data, mode);
    return new Response(new Uint8Array(workbook), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${exportFilename(query, mode)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return jsonError(error.issues[0]?.message || "فیلتر نامعتبر است", 400);
    if (error instanceof ReportExportLimitError || error instanceof WorkbookValueError)
      return jsonError(error.message, 422);
    operationalLog("export.failed", error);
    return jsonError("خروجی Excel تولید نشد. دوباره تلاش کنید.", 500);
  } finally {
    if (reserved) activeExports--;
  }
}
import { operationalLog } from "@/lib/operational-log";
