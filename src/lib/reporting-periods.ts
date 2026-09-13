import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { reportingPeriods, users } from "@/db/schema";
import { auditData, recordAudit, type Transaction } from "@/lib/audit";
import { periodWeekSchema, PeriodError, LOCKED_MESSAGE } from "@/lib/period-model";
import { weekStart, shiftDate } from "@/lib/work-reporting";
import { REPORT_ROLES } from "@/lib/business-report-query";

// Distinct advisory-lock namespace plus integer Gregorian day; protects absent rows too.
async function weekLock(tx: Transaction, start: string, exclusive: boolean) {
  const day = Math.floor(Date.parse(start) / 86400000);
  await tx.execute(
    exclusive
      ? sql`SELECT pg_advisory_xact_lock(8172402,${day})`
      : sql`SELECT pg_advisory_xact_lock_shared(8172402,${day})`,
  );
}
export async function getReportingPeriod(date: string, connection: Pick<typeof db, "select"> = db) {
  const start = periodWeekSchema.parse(weekStart(date));
  const [row] = await connection
    .select({
      id: reportingPeriods.id,
      status: reportingPeriods.status,
      weekStart: reportingPeriods.weekStart,
      weekEnd: reportingPeriods.weekEnd,
      lockedAt: reportingPeriods.lockedAt,
      lockedBy: reportingPeriods.lockedBy,
      lockedByName: users.displayName,
    })
    .from(reportingPeriods)
    .leftJoin(users, eq(reportingPeriods.lockedBy, users.id))
    .where(eq(reportingPeriods.weekStart, start));
  return row
    ? { ...row, lockedAt: row.lockedAt?.toISOString() ?? null }
    : {
        id: null,
        status: "OPEN" as const,
        weekStart: start,
        weekEnd: shiftDate(start, 6),
        lockedAt: null,
        lockedBy: null,
        lockedByName: null,
      };
}
export type ReportingPeriod = Awaited<ReturnType<typeof getReportingPeriod>>;
export async function assertReportingPeriodEditable(tx: Transaction, date: string) {
  const start = periodWeekSchema.parse(weekStart(date));
  await weekLock(tx, start, false);
  const period = await getReportingPeriod(start, tx);
  if (period.status === "LOCKED") throw new PeriodError(LOCKED_MESSAGE);
  return period;
}
export async function changeReportingPeriod(
  actorId: string,
  week: string,
  action: "lock" | "unlock",
) {
  const start = periodWeekSchema.parse(week);
  if (action !== "lock" && action !== "unlock") throw new PeriodError("عملیات نامعتبر است", 400);
  return db.transaction(async (tx) => {
    await weekLock(tx, start, true);
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId)).for("share");
    if (!actor?.isActive || !REPORT_ROLES.some((role) => role === actor.role))
      throw new PeriodError("دسترسی کافی ندارید", 403);
    const before = await getReportingPeriod(start, tx);
    const status = action === "lock" ? "LOCKED" : "OPEN";
    if (before.status === status) return before;
    const [row] = await tx
      .insert(reportingPeriods)
      .values({
        weekStart: start,
        weekEnd: shiftDate(start, 6),
        status,
        lockedAt: status === "LOCKED" ? new Date() : null,
        lockedBy: status === "LOCKED" ? actorId : null,
      })
      .onConflictDoUpdate({
        target: reportingPeriods.weekStart,
        set: {
          status,
          lockedAt: status === "LOCKED" ? new Date() : null,
          lockedBy: status === "LOCKED" ? actorId : null,
          updatedAt: new Date(),
        },
      })
      .returning();
    await recordAudit(
      tx,
      actorId,
      status === "LOCKED" ? "PERIOD_LOCKED" : "PERIOD_UNLOCKED",
      "PERIOD",
      row.id,
      auditData("PERIOD", before),
      auditData("PERIOD", row),
    );
    return getReportingPeriod(start, tx);
  });
}
