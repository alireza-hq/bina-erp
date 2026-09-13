import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, workEntries, projects, projectFiles } from "@/db/schema";
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
      projectFileId: workEntries.projectFileId,
      description: workEntries.description,
      manHours: workEntries.manHours,
      updatedAt: workEntries.updatedAt,
      projectName: projects.name,
      projectCode: projects.code,
      projectActive: projects.isActive,
      fileName: projectFiles.name,
      fileCode: projectFiles.code,
      fileActive: projectFiles.isActive,
    })
    .from(workEntries)
    .innerJoin(projects, eq(workEntries.projectId, projects.id))
    .innerJoin(projectFiles, eq(workEntries.projectFileId, projectFiles.id))
    .where(and(eq(workEntries.employeeId, employeeId), eq(workEntries.workDate, date)))
    .orderBy(asc(workEntries.id));
}
function snapshot(date: string, rows: Awaited<ReturnType<typeof readDay>>) {
  const version = createHash("sha256")
    .update(
      JSON.stringify(
        rows.map(({ id, projectId, projectFileId, description, manHours, updatedAt }) => ({
          id,
          projectId,
          projectFileId,
          description,
          manHours,
          updatedAt,
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
    .where(eq(projects.isActive, true))
    .orderBy(asc(projects.name));
}
export async function getActiveWorkFiles(projectId: string) {
  return db
    .select({ id: projectFiles.id, name: projectFiles.name, code: projectFiles.code })
    .from(projectFiles)
    .innerJoin(projects, eq(projectFiles.projectId, projects.id))
    .where(
      and(eq(projects.id, projectId), eq(projects.isActive, true), eq(projectFiles.isActive, true)),
    )
    .orderBy(asc(projectFiles.code));
}

// The only write operation: replace the caller's date set while preserving surviving IDs.
// Locking the employee also serializes this operation with account deactivation.
export async function updateOwnDailyEntries(employeeId: string, date: string, input: unknown) {
  writableDateSchema.parse(date);
  const data = dailyEntriesSchema.parse(input);
  return db.transaction(async (tx) => {
    const period = await assertReportingPeriodEditable(tx, date);
    const [employee] = await tx
      .select({ isActive: users.isActive })
      .from(users)
      .where(eq(users.id, employeeId))
      .for("no key update");
    if (!employee?.isActive)
      throw new WorkEntryError("نشست معتبر نیست یا حساب غیرفعال شده است", 401);
    const current = await readDay(tx, employeeId, date);
    if (snapshot(date, current).version !== data.version)
      throw new WorkEntryError(
        "گزارش در پنجره دیگری تغییر کرده یا قبلاً ذخیره شده است. آخرین نسخه را بارگذاری کنید.",
        409,
      );
    const existing = new Map(current.map((row) => [row.id, row]));
    for (const row of data.entries)
      if (row.id && !existing.has(row.id))
        throw new WorkEntryError("ردیف در گزارش این روز شما وجود ندارد", 404);

    if (data.entries.length) {
      const projectIds = [...new Set(data.entries.map((row) => row.projectId))].sort();
      const fileIds = [...new Set(data.entries.map((row) => row.projectFileId))].sort();
      const selectedProjects = await tx
        .select()
        .from(projects)
        .where(inArray(projects.id, projectIds))
        .orderBy(asc(projects.id))
        .for("share");
      const selectedFiles = await tx
        .select()
        .from(projectFiles)
        .where(inArray(projectFiles.id, fileIds))
        .orderBy(asc(projectFiles.id))
        .for("share");
      for (const [index, row] of data.entries.entries()) {
        const project = selectedProjects.find((p) => p.id === row.projectId);
        const file = selectedFiles.find((f) => f.id === row.projectFileId);
        if (!project || !file || file.projectId !== project.id)
          throw new WorkEntryError(`ردیف ${index + 1}: پروژه و فایل پروژه معتبر نیستند`);
        const old = row.id ? existing.get(row.id) : undefined;
        const unchangedReference =
          old?.projectId === row.projectId && old?.projectFileId === row.projectFileId;
        if (!unchangedReference && (!project.isActive || !file.isActive))
          throw new WorkEntryError(
            `ردیف ${index + 1}: برای ثبت جدید، پروژه و فایل باید فعال باشند`,
          );
      }
    }
    const kept = new Set(data.entries.flatMap((row) => (row.id ? [row.id] : [])));
    const removed = current.filter((row) => !kept.has(row.id)).map((row) => row.id);
    if (removed.length)
      await tx
        .delete(workEntries)
        .where(
          and(
            eq(workEntries.employeeId, employeeId),
            eq(workEntries.workDate, date),
            inArray(workEntries.id, removed),
          ),
        );
    for (const row of data.entries) {
      const { id, ...values } = row;
      if (id) {
        const old = existing.get(id)!;
        if (
          old.projectId !== row.projectId ||
          old.projectFileId !== row.projectFileId ||
          old.description !== row.description ||
          old.manHours !== row.manHours
        )
          await tx
            .update(workEntries)
            .set({ ...values, updatedAt: new Date() })
            .where(
              and(
                eq(workEntries.id, id),
                eq(workEntries.employeeId, employeeId),
                eq(workEntries.workDate, date),
              ),
            );
      } else await tx.insert(workEntries).values({ ...values, employeeId, workDate: date });
    }
    const after = await readDay(tx, employeeId, date);
    const final = new Map(after.map((row) => [row.id, row]));
    const payload = (row: object) =>
      auditData("WORK_ENTRY", { ...row, employeeId, workDate: date });
    for (const old of current) {
      const next = final.get(old.id);
      if (!next)
        await recordAudit(
          tx,
          employeeId,
          "WORK_ENTRY_DELETED",
          "WORK_ENTRY",
          old.id,
          payload(old),
          null,
        );
      else if (JSON.stringify(payload(old)) !== JSON.stringify(payload(next)))
        await recordAudit(
          tx,
          employeeId,
          "WORK_ENTRY_UPDATED",
          "WORK_ENTRY",
          old.id,
          payload(old),
          payload(next),
        );
    }
    for (const row of after)
      if (!existing.has(row.id))
        await recordAudit(
          tx,
          employeeId,
          "WORK_ENTRY_CREATED",
          "WORK_ENTRY",
          row.id,
          null,
          payload(row),
        );
    return { ...snapshot(date, after), period };
  });
}
