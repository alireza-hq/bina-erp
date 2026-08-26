import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { projectPermissions, users } from "@/db/schema";
import { getCurrentUser, hasSameOrigin, isAdmin } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { permissionSchema } from "@/lib/validation";
export async function PUT(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const actor = await getCurrentUser();
  if (!actor || !isAdmin(actor)) return jsonError("دسترسی کافی ندارید", 403);
  const parsed = await parseJson(request, permissionSchema);
  if ("error" in parsed) return parsed.error;
  const target = await db.query.users.findFirst({ where: eq(users.id, parsed.data.userId) });
  if (!target) return jsonError("کاربر پیدا نشد", 404);
  if (target.role !== "user") return jsonError("مدیران به همه پروژه‌ها دسترسی نوشتن دارند");
  await db
    .delete(projectPermissions)
    .where(
      and(
        eq(projectPermissions.projectId, parsed.data.projectId),
        eq(projectPermissions.userId, parsed.data.userId),
      ),
    );
  if (parsed.data.permission !== "none")
    await db.insert(projectPermissions).values({
      projectId: parsed.data.projectId,
      userId: parsed.data.userId,
      permission: parsed.data.permission,
    });
  return Response.json({ ok: true });
}
