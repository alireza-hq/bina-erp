import { ZodError } from "zod";
import { requireApiRole } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { REPORT_ROLES } from "@/lib/business-report-query";
import { periodWeekSchema, PeriodError } from "@/lib/period-model";
import { getReportingPeriod, changeReportingPeriod } from "@/lib/reporting-periods";
export async function periodApi(request: Request, week: string, action?: "lock" | "unlock") {
  try {
    const actor = await requireApiRole(request, ...REPORT_ROLES);
    if ("error" in actor) return actor.error;
    if (new URL(request.url).search) return jsonError("پارامتر اضافی مجاز نیست");
    periodWeekSchema.parse(week);
    const data = action
      ? await changeReportingPeriod(actor.user.id, week, action)
      : await getReportingPeriod(week);
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(
      error instanceof ZodError
        ? error.issues[0].message
        : error instanceof PeriodError
          ? error.message
          : "عملیات دوره انجام نشد",
      error instanceof ZodError ? 400 : error instanceof PeriodError ? error.status : 500,
    );
  }
}
