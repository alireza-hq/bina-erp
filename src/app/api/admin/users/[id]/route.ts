import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser, hasSameOrigin } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { userAdminSchema } from "@/lib/validation";
export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const actor = await getCurrentUser();
  if (actor?.role !== "super_admin") return jsonError("دسترسی کافی ندارید", 403);
  const { id } = await context.params;
  if (id === actor.id) return jsonError("نقش یا وضعیت حساب خودتان قابل تغییر نیست");
  const parsed = await parseJson(request, userAdminSchema);
  if ("error" in parsed) return parsed.error;
  const [updated] = await db
    .update(users)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!updated) return jsonError("کاربر پیدا نشد", 404);
  return Response.json({ ok: true });
}
