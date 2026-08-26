import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, letters, sheets } from "@/db/schema";
import { hasSameOrigin, requireProjectAccess } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { uploadValue } from "@/lib/upload";
import { letterFieldsSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/projects/[id]/letters/[letterId]">,
) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const { id, letterId } = await context.params;
  if (!(await requireProjectAccess(id, true))) return jsonError("دسترسی نوشتن ندارید", 403);
  try {
    const form = await request.formData();
    const parsed = letterFieldsSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return jsonError(parsed.error.issues[0]?.message || "اطلاعات نامه نامعتبر است");
    const [letter, sheet] = await Promise.all([
      db.query.letters.findFirst({
        where: and(eq(letters.id, letterId), eq(letters.projectId, id)),
      }),
      db.query.sheets.findFirst({
        where: and(eq(sheets.id, parsed.data.sheetId), eq(sheets.projectId, id)),
      }),
    ]);
    if (!letter || !sheet) return jsonError("نامه یا شیت پیدا نشد", 404);
    const [letterFile, paraph, attachment] = await Promise.all([
      uploadValue(form.get("letterFile")),
      uploadValue(form.get("paraph")),
      uploadValue(form.get("attachment")),
    ]);
    await db.transaction(async (tx) => {
      await tx
        .update(letters)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(letters.id, letterId));
      for (const [kind, file] of [
        ["letter", letterFile],
        ["paraph", paraph],
        ["attachment", attachment],
      ] as const) {
        if (file)
          await tx
            .insert(files)
            .values({ letterId, kind, ...file })
            .onConflictDoUpdate({
              target: [files.letterId, files.kind],
              set: { ...file, createdAt: new Date() },
            });
        else if (kind !== "letter" && form.get(`remove_${kind}`) === "true")
          await tx.delete(files).where(and(eq(files.letterId, letterId), eq(files.kind, kind)));
      }
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("فایل")
        ? error.message
        : "ویرایش نامه انجام نشد";
    return jsonError(message);
  }
}
export async function DELETE(
  request: Request,
  context: RouteContext<"/api/projects/[id]/letters/[letterId]">,
) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const { id, letterId } = await context.params;
  if (!(await requireProjectAccess(id, true))) return jsonError("دسترسی نوشتن ندارید", 403);
  await db.delete(letters).where(and(eq(letters.id, letterId), eq(letters.projectId, id)));
  return Response.json({ ok: true });
}
