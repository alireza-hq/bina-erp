import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  departments,
  projects,
  reportTypes,
  workEntries,
  workEntryApprovals,
} from "@/db/schema";
import { auditData, recordAudit } from "@/lib/audit";
import { WorkEntryError } from "@/lib/work-entries";
import { decisionSchema, approvalQuerySchema } from "@/lib/approval-model";
import { idSchema } from "@/lib/validation";
export async function hasManagementScope(userId: string) {
  const [row] = await db.execute<{ allowed: boolean }>(
    sql`SELECT EXISTS(SELECT 1 FROM ${departments} WHERE ${departments.managerUserId}=${userId}::uuid) OR EXISTS(SELECT 1 FROM ${projects} WHERE ${projects.managerUserId}=${userId}::uuid) OR EXISTS(SELECT 1 FROM ${workEntryApprovals} WHERE ${workEntryApprovals.managerUserId}=${userId}::uuid) AS allowed`,
  );
  return row.allowed;
}
// Current relationships own pending stages; historical decisions belong to their recorded actor.
export async function decideWorkEntry(actorId: string, entryId: string, input: unknown) {
  idSchema.parse(entryId);
  const decision = decisionSchema.parse(input);
  return db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(workEntries)
      .where(eq(workEntries.id, entryId))
      .for("update");
    if (!entry) throw new WorkEntryError("درخواست پیدا نشد", 404);
    const [actor] = await tx.select().from(users).where(eq(users.id, actorId)).for("share");
    if (!actor?.isActive || !actor.profileCompletedAt || !actor.departmentId)
      throw new WorkEntryError("دسترسی کافی ندارید", 403);
    const expected =
      decision.stage === "DEPARTMENT" ? "PENDING_DEPARTMENT_APPROVAL" : "PENDING_PROJECT_APPROVAL";
    if (entry.status !== expected)
      throw new WorkEntryError("وضعیت درخواست تغییر کرده است؛ صفحه را به‌روز کنید", 409);
    let managerId: string | null = null;
    if (decision.stage === "DEPARTMENT") {
      if (entry.departmentId) {
        const [d] = await tx
          .select()
          .from(departments)
          .where(eq(departments.id, entry.departmentId))
          .for("share");
        managerId = d?.managerUserId ?? null;
      }
    } else {
      const [p] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, entry.projectId))
        .for("share");
      managerId = p?.managerUserId ?? null;
    }
    if (managerId !== actorId) throw new WorkEntryError("این مرحله در اختیار شما نیست", 403);
    if (decision.stage === "DEPARTMENT" && decision.decision === "APPROVED") {
      const [p] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, entry.projectId))
        .for("share");
      const [manager] = p?.managerUserId
        ? await tx.select().from(users).where(eq(users.id, p.managerUserId)).for("share")
        : [];
      if (!manager?.isActive) throw new WorkEntryError("مدیر فعال پروژه تعیین نشده است", 409);
    }
    const status =
      decision.decision === "REJECTED"
        ? "REJECTED"
        : decision.stage === "DEPARTMENT"
          ? "PENDING_PROJECT_APPROVAL"
          : "APPROVED";
    const [next] = await tx
      .update(workEntries)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(workEntries.id, entryId), eq(workEntries.status, expected)))
      .returning();
    const [labels] = await tx
      .select({
        employee: users.displayName,
        department: departments.name,
        project: projects.name,
        report: reportTypes.name,
      })
      .from(workEntries)
      .innerJoin(users, eq(workEntries.employeeId, users.id))
      .leftJoin(departments, eq(workEntries.departmentId, departments.id))
      .innerJoin(projects, eq(workEntries.projectId, projects.id))
      .innerJoin(reportTypes, eq(workEntries.reportId, reportTypes.id))
      .where(eq(workEntries.id, entryId));
    const snapshot = { ...auditData("WORK_ENTRY", entry), ...labels };
    await tx.insert(workEntryApprovals).values({
      workEntryId: entryId,
      stage: decision.stage,
      managerUserId: actorId,
      decision: decision.decision,
      rejectionReason: decision.rejectionReason || null,
      snapshot,
    });
    await recordAudit(
      tx,
      actorId,
      `${decision.stage}_${decision.decision}`,
      "WORK_ENTRY",
      entryId,
      snapshot,
      { ...auditData("WORK_ENTRY", next), rejectionReason: decision.rejectionReason || null },
    );
    return { status };
  });
}
export async function getApprovals(actorId: string, input: unknown) {
  const q = approvalQuerySchema.parse(input);
  const w = workEntries,
    d = departments,
    p = projects,
    u = users,
    r = reportTypes,
    a = workEntryApprovals;
  const source = sql`${w} JOIN ${u} ON ${u.id}=${w.employeeId} LEFT JOIN ${d} ON ${d.id}=${w.departmentId} JOIN ${p} ON ${p.id}=${w.projectId} JOIN ${r} ON ${r.id}=${w.reportId}`;
  const where =
    q.view === "history"
      ? sql`${a.managerUserId}=${actorId}::uuid`
      : sql`((${w.status}='PENDING_DEPARTMENT_APPROVAL' AND ${d.managerUserId}=${actorId}::uuid) OR (${w.status}='PENDING_PROJECT_APPROVAL' AND ${p.managerUserId}=${actorId}::uuid))`;
  const joined =
    q.view === "history" ? sql`${source} JOIN ${a} ON ${a.workEntryId}=${w.id}` : source;
  return db.transaction(
    async (tx) => {
      const [count] = await tx.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM ${joined} WHERE ${where}`,
      );
      const rows = await tx.execute<{
        id: string;
        employee: string;
        department: string;
        date: string;
        project: string;
        report: string;
        manHours: string;
        description: string;
        status: string;
        stage: "DEPARTMENT" | "PROJECT";
        decision: string | null;
        reason: string | null;
        actedAt: string | null;
        snapshot: Record<string, unknown> | null;
      }>(
        sql`SELECT ${q.view === "history" ? sql`${a.id}` : sql`${w.id}`} AS id,${u.displayName} AS employee,${d.name} AS department,${w.workDate}::text AS date,${p.name} AS project,${r.name} AS report,${w.manHours}::text AS "manHours",${w.description} AS description,${w.status} AS status,${q.view === "history" ? sql`${a.stage}` : sql`CASE WHEN ${w.status}='PENDING_DEPARTMENT_APPROVAL' THEN 'DEPARTMENT' ELSE 'PROJECT' END`} AS stage,${q.view === "history" ? sql`${a.decision}` : sql`NULL`} AS decision,${q.view === "history" ? sql`${a.rejectionReason}` : sql`NULL`} AS reason,${q.view === "history" ? sql`${a.actedAt}::text` : sql`NULL`} AS "actedAt",${q.view === "history" ? sql`${a.snapshot}` : sql`NULL`} AS snapshot FROM ${joined} WHERE ${where} ORDER BY ${q.view === "history" ? sql`${a.actedAt} DESC,${a.id}` : sql`${w.workDate},${w.id}`} LIMIT 50 OFFSET ${(q.page - 1) * 50}`,
      );
      return {
        rows: Array.from(rows).map((row) =>
          q.view === "history" && row.snapshot
            ? {
                ...row,
                employee: String(row.snapshot.employee ?? row.employee),
                department: String(row.snapshot.department ?? row.department),
                project: String(row.snapshot.project ?? row.project),
                report: String(row.snapshot.report ?? row.report),
                description: String(row.snapshot.description ?? row.description),
                manHours: String(row.snapshot.manHours ?? row.manHours),
                date: String(row.snapshot.workDate ?? row.date),
              }
            : row,
        ),
        count: count.count,
        page: q.page,
        view: q.view,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
