import { PeriodError, LOCKED_MESSAGE } from "@/lib/period-model";
import { weekStart, shiftDate, todayInTehran } from "@/lib/work-reporting";
import type { Transaction } from "@/lib/audit";
export async function getReportingPeriod(date: string, _connection?: unknown) {
  void _connection;
  const start = weekStart(date);
  return {
    id: null,
    status: start === weekStart(todayInTehran()) ? ("OPEN" as const) : ("LOCKED" as const),
    weekStart: start,
    weekEnd: shiftDate(start, 6),
    lockedAt: null,
    lockedBy: null,
    lockedByName: null,
  };
}
export type ReportingPeriod = Awaited<ReturnType<typeof getReportingPeriod>>;
export async function assertReportingPeriodEditable(_tx: Transaction, date: string) {
  const period = await getReportingPeriod(date);
  if (period.status === "LOCKED") throw new PeriodError(LOCKED_MESSAGE);
  return period;
}
