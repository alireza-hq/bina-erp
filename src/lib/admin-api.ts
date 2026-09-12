import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { departments, projects, projectFiles, sessions, users } from "@/db/schema";
import { requireApiRole } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import {
  departmentSchema,
  departmentUpdateSchema,
  idSchema,
  projectFileSchema,
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
  return jsonError("عملیات انجام نشد. دوباره تلاش کنید.", 500);
}
const validId = (id: string) => idSchema.safeParse(id).success;
type Master = "departments" | "projects";

export async function masterCollection(request: Request, kind: Master) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  const table = kind === "departments" ? departments : projects;
  try {
    if (request.method === "GET") return ok(await db.select().from(table).orderBy(asc(table.name)));
    if (kind === "departments") {
      const parsed = await parseJson(request, departmentSchema);
      if ("error" in parsed) return parsed.error;
      return ok((await db.insert(departments).values(parsed.data).returning())[0], 201);
    }
    const parsed = await parseJson(request, projectSchema);
    if ("error" in parsed) return parsed.error;
    return ok((await db.insert(projects).values(parsed.data).returning())[0], 201);
  } catch (error) {
    return failure(error);
  }
}

export async function masterItem(request: Request, kind: Master, id: string) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  if (!validId(id)) return jsonError("شناسه نامعتبر است");
  try {
    if (kind === "departments") {
      const parsed = await parseJson(request, departmentUpdateSchema);
      if ("error" in parsed) return parsed.error;
      const [row] = await db
        .update(departments)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(departments.id, id))
        .returning();
      return row ? ok(row) : jsonError("واحد پیدا نشد", 404);
    }
    const parsed = await parseJson(request, projectUpdateSchema);
    if ("error" in parsed) return parsed.error;
    const [row] = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return row ? ok(row) : jsonError("پروژه پیدا نشد", 404);
  } catch (error) {
    return failure(error);
  }
}

export async function projectFileCollection(request: Request, projectId: string) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  if (!validId(projectId)) return jsonError("شناسه نامعتبر است");
  try {
    const data = await db.transaction(async (tx) => {
      // Serialize creation with project deactivation; inactive parents cannot gain new options.
      const [project] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!project) throw new AdminError("پروژه پیدا نشد", 404);
      if (request.method === "GET")
        return tx
          .select()
          .from(projectFiles)
          .where(eq(projectFiles.projectId, projectId))
          .orderBy(asc(projectFiles.code));
      if (!project.isActive) throw new AdminError("ابتدا پروژه را فعال کنید", 409);
      const parsed = await parseJson(request, projectFileSchema);
      if ("error" in parsed) return parsed.error;
      return (
        await tx
          .insert(projectFiles)
          .values({ ...parsed.data, projectId })
          .returning()
      )[0];
    });
    return data instanceof Response ? data : ok(data, request.method === "GET" ? 200 : 201);
  } catch (error) {
    return failure(error);
  }
}

export async function projectFileItem(request: Request, projectId: string, id: string) {
  const actor = await requireApiRole(request, "IT_ADMIN");
  if ("error" in actor) return actor.error;
  if (!validId(projectId) || !validId(id)) return jsonError("شناسه نامعتبر است");
  const parsed = await parseJson(request, projectUpdateSchema);
  if ("error" in parsed) return parsed.error;
  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!project) throw new AdminError("پروژه پیدا نشد", 404);
      const [file] = await tx
        .select()
        .from(projectFiles)
        .where(and(eq(projectFiles.id, id), eq(projectFiles.projectId, projectId)));
      if (!file) throw new AdminError("فایل پروژه پیدا نشد", 404);
      if (parsed.data.isActive === true && !file.isActive && !project.isActive)
        throw new AdminError("ابتدا پروژه را فعال کنید", 409);
      const [row] = await tx
        .update(projectFiles)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(projectFiles.id, id), eq(projectFiles.projectId, projectId)))
        .returning();
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
  email: users.email,
  role: users.role,
  isActive: users.isActive,
  departmentId: users.departmentId,
  employeeCode: users.employeeCode,
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
      const [target] = await tx.select().from(users).where(eq(users.id, id)).for("update");
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
        .set({ ...data, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning(userAdminColumns);
      if (data.isActive === false) await tx.delete(sessions).where(eq(sessions.userId, id));
      return ok(row);
    });
  } catch (error) {
    return failure(error);
  }
}
