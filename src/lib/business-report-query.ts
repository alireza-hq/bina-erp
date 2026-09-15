import { WORK_STATUSES } from "@/lib/approval-model";
import { z } from "zod";
import { isCalendarDate, shiftDate, todayInTehran, weekStart } from "@/lib/work-reporting";

export const REPORT_ROLES = ["BUSINESS_ADMIN", "IT_ADMIN"] as const;
export const GROUP_DIMENSIONS = ["employee", "department", "project", "report", "date"] as const;
export const groupLabels = {
  employee: "کارمند",
  department: "واحد",
  project: "پروژه",
  report: "گزارش",
  date: "تاریخ",
};
export const REPORT_MAX_DAYS = 366;
const date = z.string().refine(isCalendarDate, "تاریخ معتبر نیست");
const optionalId = z.uuid().optional();
const page = z.coerce.number().int().min(1).max(100000).default(1);
export const businessReportSchema = z
  .object({
    from: date,
    to: date,
    employeeId: optionalId,
    departmentId: optionalId,
    projectId: optionalId,
    reportId: optionalId,
    status: z.enum([...WORK_STATUSES, "ALL"]).default("APPROVED"),
    groupBy: z.enum(GROUP_DIMENSIONS).optional(),
    groupBySecondary: z.enum(GROUP_DIMENSIONS).optional(),
    sort: z
      .enum(["date", "employee", "department", "project", "report", "manHours"])
      .default("date"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    page,
    groupPage: page,
    pageSize: z.coerce
      .number()
      .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
      .default(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from > value.to)
      ctx.addIssue({ code: "custom", message: "تاریخ شروع باید قبل از پایان باشد" });
    if (
      isCalendarDate(value.from) &&
      isCalendarDate(value.to) &&
      (Date.parse(value.to) - Date.parse(value.from)) / 86400000 >= REPORT_MAX_DAYS
    )
      ctx.addIssue({ code: "custom", message: "بازه گزارش حداکثر ۳۶۶ روز است" });
    if (value.groupBySecondary && (!value.groupBy || value.groupBy === value.groupBySecondary))
      ctx.addIssue({ code: "custom", message: "گروه دوم باید متفاوت از گروه اول باشد" });
  });
export type BusinessReportQuery = z.infer<typeof businessReportSchema>;
export function parseBusinessReportQuery(input: Record<string, unknown>) {
  const start = weekStart(todayInTehran());
  // A custom range must supply both endpoints; defaults apply only to an absent range.
  return businessReportSchema.parse(
    input.from === undefined && input.to === undefined
      ? { ...input, from: start, to: shiftDate(start, 6) }
      : input,
  );
}
export function queryRecord(params: URLSearchParams) {
  const record: Record<string, string | string[]> = {};
  for (const key of params.keys())
    record[key] = params.getAll(key).length > 1 ? params.getAll(key) : params.get(key)!;
  return record;
}
export function reportHref(query: BusinessReportQuery, changes: Partial<BusinessReportQuery> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, ...changes }))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return `/admin/reports?${params}`;
}
// SQL numeric sums remain strings, including totals larger than a single-entry limit.
export function reportHours(value: string) {
  return value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") : value;
}
export const reportOptionsSchema = z
  .object({
    kind: z.enum(["employee", "department", "project", "report"]),
    search: z.string().trim().max(100).default(""),
    projectId: optionalId,
    departmentId: optionalId,
    selected: optionalId,
  })
  .strict();
