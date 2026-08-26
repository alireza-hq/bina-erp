import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { sheets } from "@/db/schema";
import { hasSameOrigin, requireProjectAccess } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { sheetSchema } from "@/lib/validation";
async function authorize(request: Request, id: string) {
  return hasSameOrigin(request) && (await requireProjectAccess(id, true));
}
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[id]/sheets/[sheetId]">,
) {
  const { id, sheetId } = await context.params;
  if (!(await authorize(request, id))) return jsonError("دسترسی نوشتن ندارید", 403);
  const parsed = await parseJson(request, sheetSchema);
  if ("error" in parsed) return parsed.error;
  try {
    const [updated] = await db
      .update(sheets)
      .set({ name: parsed.data.name, updatedAt: new Date() })
      .where(and(eq(sheets.id, sheetId), eq(sheets.projectId, id)))
      .returning({ id: sheets.id });
    return updated ? Response.json({ ok: true }) : jsonError("شیت پیدا نشد", 404);
  } catch {
    return jsonError("نام شیت تکراری است", 409);
  }
}
export async function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]/sheets/[sheetId]">,
) {
  const { id, sheetId } = await context.params;
  if (!(await authorize(request, id))) return jsonError("دسترسی نوشتن ندارید", 403);
  const [{ total }] = await db
    .select({ total: count() })
    .from(sheets)
    .where(eq(sheets.projectId, id));
  if (Number(total) <= 1) return jsonError("هر پروژه باید حداقل یک شیت داشته باشد");
  await db.delete(sheets).where(and(eq(sheets.id, sheetId), eq(sheets.projectId, id)));
  return Response.json({ ok: true });
}
