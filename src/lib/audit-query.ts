import { z } from "zod";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/audit-model";
import { isCalendarDate, todayInTehran, shiftDate } from "@/lib/work-reporting";
const date = z.string().refine(isCalendarDate, "تاریخ معتبر نیست");
export const auditQuerySchema = z
  .object({
    from: date,
    to: date,
    actor: z.string().trim().max(100).default(""),
    action: z.union([z.enum(AUDIT_ACTIONS), z.literal("")]).default(""),
    entityType: z.union([z.enum(AUDIT_ENTITIES), z.literal("")]).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce
      .number()
      .pipe(z.union([z.literal(25), z.literal(50), z.literal(100)]))
      .default(50),
  })
  .strict()
  .refine((q) => q.from <= q.to, "بازه تاریخ نامعتبر است");
export function parseAuditQuery(input: Record<string, unknown>) {
  const today = todayInTehran();
  return auditQuerySchema.parse({ ...{ from: shiftDate(today, -29), to: today }, ...input });
}
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export function auditHref(query: AuditQuery, page: number) {
  return `/system/audit?${new URLSearchParams({ ...query, page: String(page), pageSize: String(query.pageSize) })}`;
}
