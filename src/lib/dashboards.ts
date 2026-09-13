import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users, workEntries, projects } from "@/db/schema";
import { requireRole, requireUser } from "@/lib/auth";
import { REPORT_ROLES, parseBusinessReportQuery } from "@/lib/business-report-query";
import { getBusinessReport } from "@/lib/business-reports";
import { getOwnWorkWeek } from "@/lib/work-entries";
import { getReportingPeriod } from "@/lib/reporting-periods";
import { todayInTehran, weekStart, shiftDate } from "@/lib/work-reporting";

export async function getEmployeeDashboard() {
  const user = await requireUser();
  const today = todayInTehran();
  const week = await getOwnWorkWeek(user.id, today);
  return {
    today,
    week,
    todayReport: week.days.find((day) => day.date === today)!,
    reportedDays: week.days.filter((day) => day.count > 0).length,
  };
}

export async function getBusinessDashboard() {
  await requireRole(...REPORT_ROLES);
  const from = weekStart(todayInTehran()),
    to = shiftDate(from, 6);
  const query = parseBusinessReportQuery({ from, to });
  return db.transaction(
    async (tx) => {
      // Reuse the reporting engine, including its exact totals and current-department semantics.
      const report = await getBusinessReport({ ...query, groupBy: "project" }, tx);
      const departments = await getBusinessReport({ ...query, groupBy: "department" }, tx);
      const range = sql`${workEntries.workDate} >= ${from}::date AND ${workEntries.workDate} <= ${to}::date`;
      // Expected reporters are active EMPLOYEE accounts, regardless of department assignment.
      const missing = sql`${users.isActive} AND ${users.role} = 'EMPLOYEE' AND NOT EXISTS (SELECT 1 FROM ${workEntries} WHERE ${workEntries.employeeId} = ${users.id} AND ${range})`;
      const [counts] = await tx.execute<{
        reporters: number;
        missing: number;
        activeProjects: number;
      }>(sql`SELECT
      (SELECT count(DISTINCT ${workEntries.employeeId})::int FROM ${workEntries} WHERE ${range}) AS reporters,
      (SELECT count(*)::int FROM ${users} WHERE ${missing}) AS missing,
      (SELECT count(DISTINCT ${workEntries.projectId})::int FROM ${workEntries} JOIN ${projects} ON ${workEntries.projectId} = ${projects.id} WHERE ${range} AND ${projects.isActive}) AS "activeProjects"`);
      const missingPeople = await tx.execute<{ id: string; name: string; username: string }>(
        sql`SELECT ${users.id} AS id, ${users.displayName} AS name, ${users.username} AS username FROM ${users} WHERE ${missing} ORDER BY ${users.displayName}, ${users.id} LIMIT 20`,
      );
      return {
        query,
        report,
        departments,
        counts,
        missingPeople: Array.from(missingPeople),
        period: await getReportingPeriod(from, tx),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
