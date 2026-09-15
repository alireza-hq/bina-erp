import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  workEntries,
  projects,
  reportTypes,
  departments,
  workEntryApprovals,
} from "@/db/schema";
import { assertReportingPeriodEditable, getReportingPeriod } from "@/lib/reporting-periods";
import { auditData, recordAudit } from "@/lib/audit";
import { dailyEntriesSchema, reportDateSchema, writableDateSchema } from "@/lib/work-validation";
import {
  WORK_LIMITS,
  hoursToHundredths,
  hundredthsToHours,
  shiftDate,
  weekStart,
} from "@/lib/work-reporting";

type Connection = Pick<typeof db, "select">;
export class WorkEntryError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
async function readDay(connection: Connection, employeeId: string, date: string) {
  return connection
    .select({
      id: workEntries.id,
      projectId: workEntries.projectId,
      reportId: workEntries.reportId,
      description: workEntries.description,
      manHours: workEntries.manHours,
      updatedAt: workEntries.updatedAt,
      projectName: projects.name,
      projectCode: projects.code,
      projectActive: projects.isActive,
      reportName: reportTypes.name,
      status: workEntries.status,
      departmentId: workEntries.departmentId,
      reportActive: reportTypes.isActive,
    })
    .from(workEntries)
    .innerJoin(projects, eq(workEntries.projectId, projects.id))
    .innerJoin(reportTypes, eq(workEntries.reportId, reportTypes.id))
    .where(and(eq(workEntries.employeeId, employeeId), eq(workEntries.workDate, date)))
    .orderBy(asc(workEntries.id));
}
function snapshot(date: string, rows: Awaited<ReturnType<typeof readDay>>) {
  const version = createHash("sha256")
    .update(
      JSON.stringify(
        rows.map(({ id, projectId, reportId, description, manHours, updatedAt, status }) => ({
          id,
          projectId,
          reportId,
          description,
          manHours,
          updatedAt,
          status,
        })),
      ),
    )
    .digest("hex");
  const totalHundredths = rows.reduce((sum, row) => sum + hoursToHundredths(row.manHours)!, 0);
  return {
    date,
    version,
    entries: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    totalHours: hundredthsToHours(totalHundredths),
    highTotal: totalHundredths > WORK_LIMITS.warningHundredths,
  };
}
export type OwnDay = Awaited<ReturnType<typeof getOwnWorkEntriesForDate>>;
export async function getOwnWorkEntriesForDate(employeeId: string, date: string) {
  reportDateSchema.parse(date);
  return {
    ...snapshot(date, await readDay(db, employeeId, date)),
    period: await getReportingPeriod(date),
    history: await db
      .select({
        id: workEntryApprovals.id,
        workEntryId: workEntryApprovals.workEntryId,
        stage: workEntryApprovals.stage,
        decision: workEntryApprovals.decision,
        rejectionReason: workEntryApprovals.rejectionReason,
        actedAt: workEntryApprovals.actedAt,
        managerName: users.displayName,
      })
      .from(workEntryApprovals)
      .innerJoin(workEntries, eq(workEntryApprovals.workEntryId, workEntries.id))
      .innerJoin(users, eq(workEntryApprovals.managerUserId, users.id))
      .where(and(eq(workEntries.employeeId, employeeId), eq(workEntries.workDate, date)))
      .orderBy(desc(workEntryApprovals.actedAt)),
  };
}
export async function getOwnWorkWeek(employeeId: string, date: string) {
  reportDateSchema.parse(date);
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: shiftDate(start, index),
    count: 0,
    totalHundredths: 0,
  }));
  const rows = await db
    .select({
      date: workEntries.workDate,
      manHours: sql<string>`sum(${workEntries.manHours})::text`,
      count: sql<number>`count(*)::int`,
    })
    .from(workEntries)
    .where(
      and(
        eq(workEntries.employeeId, employeeId),
        gte(workEntries.workDate, start),
        lte(workEntries.workDate, days[6].date),
      ),
    )
    .groupBy(workEntries.workDate);
  for (const row of rows) {
    const day = days.find((day) => day.date === row.date)!;
    day.count = row.count;
    day.totalHundredths += hoursToHundredths(row.manHours)!;
  }
  return {
    start,
    period: await getReportingPeriod(start),
    days,
    totalHundredths: days.reduce((sum, day) => sum + day.totalHundredths, 0),
    count: days.reduce((sum, day) => sum + day.count, 0),
  };
}
export async function getActiveWorkProjects() {
  return db
    .select({ id: projects.id, name: projects.name, code: projects.code })
    .from(projects)
    .innerJoin(users, eq(projects.managerUserId, users.id))
    .where(
      and(eq(projects.isActive, true), eq(users.isActive, true), isNotNull(projects.managerUserId)),
    )
    .orderBy(asc(projects.name));
}
export async function getActiveWorkReports() {
  return db
    .select({ id: reportTypes.id, name: reportTypes.name })
    .from(reportTypes)
    .where(eq(reportTypes.isActive, true))
    .orderBy(asc(reportTypes.name));
}

// A day is submitted atomically. Existing pending/approved rows must be preserved verbatim.
// Rejected rows are explicitly resubmitted by the day action; decision history is never removed.
export async function updateOwnDailyEntries(employeeId: string, date: string, input: unknown) {
  writableDateSchema.parse(date);
  const data = dailyEntriesSchema.parse(input);
  return db.transaction(async (tx) => {
    const period = await assertReportingPeriodEditable(tx, date);
    const [employee] = await tx
      .select()
      .from(users)
      .where(eq(users.id, employeeId))
      .for("no key update");
    if (!employee?.isActive) throw new WorkEntryError("نشست معتبر نیست", 401);
    if (!employee.profileCompletedAt || !employee.departmentId)
      throw new WorkEntryError("ابتدا مشخصات خود را تکمیل کنید", 428);
    await tx
      .select({ id: workEntries.id })
      .from(workEntries)
      .where(and(eq(workEntries.employeeId, employeeId), eq(workEntries.workDate, date)))
      .orderBy(asc(workEntries.id))
      .for("update");
    const current = await readDay(tx, employeeId, date);
    if (snapshot(date, current).version !== data.version)
      throw new WorkEntryError("گزارش تغییر کرده است؛ آخرین نسخه را بارگذاری کنید", 409);
    const existing = new Map(current.map((row) => [row.id, row]));
    for (const row of data.entries)
      if (row.id && !existing.has(row.id))
        throw new WorkEntryError("ردیف متعلق به این گزارش شما نیست", 404);
    if (current.some((row) => !data.entries.some((next) => next.id === row.id)))
      throw new WorkEntryError("گزارش ارسال‌شده حذف نمی‌شود؛ سوابق تأیید باید حفظ شوند", 409);
    const changed = data.entries.filter((row) => {
      const old = row.id ? existing.get(row.id) : undefined;
      if (!old || old.status === "REJECTED") return true;
      if (
        old.projectId !== row.projectId ||
        old.reportId !== row.reportId ||
        old.description !== row.description ||
        hoursToHundredths(old.manHours) !== hoursToHundredths(row.manHours)
      )
        throw new WorkEntryError("گزارش در انتظار تأیید یا تأییدشده قابل ویرایش نیست", 409);
      return false;
    });
    if (changed.length) {
      const [department] = await tx
        .select()
        .from(departments)
        .where(eq(departments.id, employee.departmentId))
        .for("share");
      if (!department?.isActive || !department.managerUserId)
        throw new WorkEntryError(
          "مدیر واحد شما تعیین نشده یا واحد غیرفعال است؛ با فناوری اطلاعات تماس بگیرید",
          409,
        );
      const [departmentManager] = await tx
        .select()
        .from(users)
        .where(eq(users.id, department.managerUserId))
        .for("share");
      if (!departmentManager?.isActive) throw new WorkEntryError("مدیر واحد فعال نیست", 409);
      for (const row of changed) {
        const [project] = await tx
          .select()
          .from(projects)
          .where(eq(projects.id, row.projectId))
          .for("share");
        const [report] = await tx
          .select()
          .from(reportTypes)
          .where(eq(reportTypes.id, row.reportId))
          .for("share");
        if (!project?.isActive || !project.managerUserId || !report?.isActive)
          throw new WorkEntryError("پروژه دارای مدیر و گزارش فعال انتخاب کنید", 409);
        const [manager] = await tx
          .select()
          .from(users)
          .where(eq(users.id, project.managerUserId))
          .for("share");
        if (!manager?.isActive) throw new WorkEntryError("مدیر پروژه فعال نیست", 409);
        const { id, ...values } = row;
        const next = {
          ...values,
          employeeId,
          workDate: date,
          departmentId: employee.departmentId,
          status: "PENDING_DEPARTMENT_APPROVAL" as const,
          updatedAt: new Date(),
        };
        const [saved] = id
          ? await tx
              .update(workEntries)
              .set(next)
              .where(and(eq(workEntries.id, id), eq(workEntries.employeeId, employeeId)))
              .returning()
          : await tx.insert(workEntries).values(next).returning();
        await recordAudit(
          tx,
          employeeId,
          id ? "WORK_ENTRY_RESUBMITTED" : "WORK_ENTRY_SUBMITTED",
          "WORK_ENTRY",
          saved.id,
          id ? auditData("WORK_ENTRY", existing.get(id)!) : null,
          auditData("WORK_ENTRY", saved),
        );
      }
    }
    // Check the Tehran boundary again before commit, including saves that cross midnight.
    await assertReportingPeriodEditable(tx, date);
    return { ...snapshot(date, await readDay(tx, employeeId, date)), period, history: [] };
  });
}
