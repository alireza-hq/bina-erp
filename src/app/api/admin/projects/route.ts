import { db } from "@/db";
import { projects, sheets } from "@/db/schema";
import { getCurrentUser, hasSameOrigin, isAdmin } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { projectSchema } from "@/lib/validation";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return jsonError("دسترسی کافی ندارید", 403);
  const parsed = await parseJson(request, projectSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const project = await db.transaction(async (tx) => {
      const [created] = await tx.insert(projects).values(parsed.data).returning();
      await tx.insert(sheets).values({ projectId: created.id, name: "نامه‌ها", position: 0 });
      return created;
    });
    return Response.json({ ok: true, project });
  } catch {
    return jsonError("کد پروژه تکراری است", 409);
  }
}
