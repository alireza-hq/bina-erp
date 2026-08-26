import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { canDeleteProjects, getCurrentUser, hasSameOrigin, isAdmin } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { projectSchema } from "@/lib/validation";
async function authorize(request: Request) {
  if (!hasSameOrigin(request)) return null;
  const user = await getCurrentUser();
  return user && isAdmin(user) ? user : null;
}
export async function PATCH(request: Request, context: RouteContext<"/api/admin/projects/[id]">) {
  if (!(await authorize(request))) return jsonError("دسترسی کافی ندارید", 403);
  const parsed = await parseJson(request, projectSchema);
  if ("error" in parsed) return parsed.error;
  const { id } = await context.params;
  try {
    const [updated] = await db
      .update(projects)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    return updated ? Response.json({ ok: true }) : jsonError("پروژه پیدا نشد", 404);
  } catch {
    return jsonError("کد پروژه تکراری است", 409);
  }
}
export async function DELETE(request: Request, context: RouteContext<"/api/admin/projects/[id]">) {
  const actor = await authorize(request);
  if (!actor || !canDeleteProjects(actor))
    return jsonError("حذف پروژه فقط برای مدیر اصلی مجاز است", 403);
  const { id } = await context.params;
  await db.delete(projects).where(eq(projects.id, id));
  return Response.json({ ok: true });
}
