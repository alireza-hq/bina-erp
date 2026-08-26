import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { sheets } from "@/db/schema";
import { hasSameOrigin, requireProjectAccess } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { sheetSchema } from "@/lib/validation";
export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/sheets">) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const { id } = await context.params;
  if (!(await requireProjectAccess(id, true))) return jsonError("دسترسی نوشتن ندارید", 403);
  const parsed = await parseJson(request, sheetSchema);
  if ("error" in parsed) return parsed.error;
  const last = await db
    .select({ position: sheets.position })
    .from(sheets)
    .where(eq(sheets.projectId, id))
    .orderBy(desc(sheets.position))
    .limit(1);
  try {
    const [created] = await db
      .insert(sheets)
      .values({ projectId: id, name: parsed.data.name, position: (last[0]?.position ?? -1) + 1 })
      .returning();
    return Response.json({ ok: true, sheet: created });
  } catch {
    return jsonError("نام شیت تکراری است", 409);
  }
}
