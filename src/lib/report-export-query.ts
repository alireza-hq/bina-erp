import { z } from "zod";
import {
  parseBusinessReportQuery,
  reportHref,
  type BusinessReportQuery,
} from "@/lib/business-report-query";
export const EXPORT_MAX_ROWS = 20000;
export const exportModeSchema = z.enum(["details", "summary"]);
export type ExportMode = z.infer<typeof exportModeSchema>;
export function parseReportExportQuery(input: Record<string, unknown>) {
  const { mode, ...filters } = input;
  return { mode: exportModeSchema.parse(mode), query: parseBusinessReportQuery(filters) };
}
export function exportFilename(query: BusinessReportQuery, mode: ExportMode) {
  return `work-report-${mode}-${query.from}-to-${query.to}.xlsx`;
}
export function exportHref(query: BusinessReportQuery, mode: ExportMode) {
  return (
    reportHref(query).replace("/admin/reports?", "/api/admin/reports/export?") + `&mode=${mode}`
  );
}
export class ReportExportLimitError extends Error {
  constructor() {
    super("خروجی حداکثر ۲۰٬۰۰۰ ردیف منبع را پشتیبانی می‌کند؛ بازه یا فیلترها را محدود کنید.");
  }
}
