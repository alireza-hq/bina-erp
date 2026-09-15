import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, projects, reportTypes, sessions, users } from "@/db/schema";
import { requireApiRole } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { auditMasterChange } from "@/lib/audit";
import {
  departmentSchema,
  departmentUpdateSchema,
  idSchema,
  reportSchema,
  reportUpdateSchema,
  projectSchema,
  projectUpdateSchema,
  userAdminSchema,
} from "@/lib/validation";

function ok(data: unknown, status = 200) {
  return Response.json({ ok: true, data }, { status, headers: { "Cache-Control": "no-store" } });
}
class AdminError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
function failure(error: unknown) {
  if (error instanceof AdminError) return jsonError(error.message, error.status);
  const cause = error as { code?: string; cause?: { code?: string } };
  const code = cause?.code || cause?.cause?.code;
  if (code === "23505") return jsonError("نام یا کد تکراری است. مقدار دیگری وارد کنید.", 409);
  if (code === "23503") return jsonError("رکورد مرتبط معتبر نیست یا هنوز استفاده می‌شود.", 409);
  operationalLog("admin.mutation_failed", error);
  return jsonError("عملیات انجام نشد. دوباره تلاش کنید.", 500);
}
const validId = (id: string) => idSchema.safeParse(id).success;
type Master = "departments" | "projects" | "reports";

export async function masterCollection(request: Request, kind: Master) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  const table = kind === "departments" ? departments : kind === "projects" ? projects : reportTypes;
  try {
    if (request.method === "GET") return ok(await db.select().from(table).orderBy(asc(table.name)));
    if (kind === "reports") {
      const parsed = await parseJson(request, reportSchema);
      if ("error" in parsed) return parsed.error;
      return await db.transaction(async (tx) => {
        const [row] = await tx.insert(reportTypes).values(parsed.data).returning();
        await auditMasterChange(tx, actor.user.id, "REPORT", row.id, null, row);
        return ok(row, 201);
      });
    }
    if (kind === "departments") {
      const parsed = await parseJson(request, departmentSchema);
      if ("error" in parsed) return parsed.error;
      return await db.transaction(async (tx) => {
        await validateManager(tx, parsed.data.managerUserId, parsed.data.isActive);
        const [row] = await tx.insert(departments).values(parsed.data).returning();
        await auditMasterChange(tx, actor.user.id, "DEPARTMENT", row.id, null, row);
        return ok(row, 201);
      });
    }
    const parsed = await parseJson(request, projectSchema);
    if ("error" in parsed) return parsed.error;
    return await db.transaction(async (tx) => {
      await validateManager(tx, parsed.data.managerUserId, parsed.data.isActive);
      const [row] = await tx.insert(projects).values(parsed.data).returning();
      await auditMasterChange(tx, actor.user.id, "PROJECT", row.id, null, row);
      return ok(row, 201);
    });
  } catch (error) {
    return failure(error);
  }
}

export async function masterItem(request: Request, kind: Master, id: string) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  if (!validId(id)) return jsonError("شناسه نامعتبر است");
  try {
    if (kind === "reports") {
      const parsed = await parseJson(request, reportUpdateSchema);
      if ("error" in parsed) return parsed.error;
      return await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(reportTypes)
          .where(eq(reportTypes.id, id))
          .for("update");
        if (!before) return jsonError("گزارش پیدا نشد", 404);
        const [row] = await tx
          .update(reportTypes)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(reportTypes.id, id))
          .returning();
        await auditMasterChange(tx, actor.user.id, "REPORT", id, before, row);
        return ok(row);
      });
    }
    if (kind === "departments") {
      const parsed = await parseJson(request, departmentUpdateSchema);
      if ("error" in parsed) return parsed.error;
      return await db.transaction(async (tx) => {
        const [before] = await tx
          .select()
          .from(departments)
          .where(eq(departments.id, id))
          .for("update");
        if (!before) return jsonError("واحد پیدا نشد", 404);
        await validateManager(
          tx,
          parsed.data.managerUserId === undefined
            ? before.managerUserId
            : parsed.data.managerUserId,
          parsed.data.isActive ?? before.isActive,
        );
        const [row] = await tx
          .update(departments)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(departments.id, id))
          .returning();
        await auditMasterChange(tx, actor.user.id, "DEPARTMENT", id, before, row);
        return ok(row);
      });
    }
    const parsed = await parseJson(request, projectUpdateSchema);
    if ("error" in parsed) return parsed.error;
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
      if (!before) return jsonError("پروژه پیدا نشد", 404);
      await validateManager(
        tx,
        parsed.data.managerUserId === undefined ? before.managerUserId : parsed.data.managerUserId,
        parsed.data.isActive ?? before.isActive,
      );
      const [row] = await tx
        .update(projects)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      await auditMasterChange(tx, actor.user.id, "PROJECT", id, before, row);
      return ok(row);
    });
  } catch (error) {
    return failure(error);
  }
}

// Only application/directory display fields are exposed; never session tokens or LDAP DNs.
export const userAdminColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  isActive: users.isActive,
  departmentId: users.departmentId,
  lastLoginAt: users.lastLoginAt,
};
export async function userCollection(request: Request) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  try {
    return ok(await db.select(userAdminColumns).from(users).orderBy(asc(users.displayName)));
  } catch (error) {
    return failure(error);
  }
}
export async function updateUser(request: Request, id: string) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  if (!validId(id)) return jsonError("شناسه نامعتبر است");
  const parsed = await parseJson(request, userAdminSchema);
  if ("error" in parsed) return parsed.error;
  try {
    return await db.transaction(async (tx) => {
      // Serialize role changes and recheck the actor to prevent concurrent admin lockout.
      await tx.execute(sql`select pg_advisory_xact_lock(8172401)`);
      const [currentActor] = await tx.select().from(users).where(eq(users.id, actor.user.id));
      if (!currentActor?.isActive || currentActor.role !== "IT_ADMIN")
        throw new AdminError("دسترسی کافی ندارید", 403);
      // Serialize edits without blocking the key-share FK check of audit inserts by this actor.
      const [target] = await tx.select().from(users).where(eq(users.id, id)).for("no key update");
      if (!target) throw new AdminError("کاربر پیدا نشد", 404);
      const data = parsed.data;
      if (
        id === actor.user.id &&
        ((data.role && data.role !== "IT_ADMIN") || data.isActive === false)
      )
        throw new AdminError("نمی‌توانید دسترسی مدیریتی خود را حذف کنید", 409);
      if (data.departmentId && data.departmentId !== target.departmentId) {
        const [department] = await tx
          .select()
          .from(departments)
          .where(eq(departments.id, data.departmentId))
          .for("share");
        if (!department?.isActive)
          throw new AdminError("واحد انتخاب‌شده فعال نیست یا وجود ندارد", 409);
      }
      const [row] = await tx
        .update(users)
        .set({
          ...data,
          profileCompletedAt:
            (data.displayName ?? target.displayName).trim().length >= 2 &&
            (data.departmentId === undefined ? target.departmentId : data.departmentId)
              ? (target.profileCompletedAt ?? (data.displayName !== undefined ? new Date() : null))
              : null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning(userAdminColumns);
      if (data.isActive === false) await tx.delete(sessions).where(eq(sessions.userId, id));
      await auditMasterChange(tx, actor.user.id, "USER", id, target, row);
      return ok(row);
    });
  } catch (error) {
    return failure(error);
  }
}
import { operationalLog } from "@/lib/operational-log";

async function validateManager(
  tx: import("@/lib/audit").Transaction,
  id: string | null | undefined,
  active: boolean,
) {
  if (!id) {
    if (active) throw new AdminError("برای فعال‌سازی، مدیر تعیین کنید", 409);
    return;
  }
  const [manager] = await tx.select().from(users).where(eq(users.id, id)).for("share");
  if (!manager?.isActive) throw new AdminError("مدیر باید کاربر فعال سامانه باشد", 409);
}
