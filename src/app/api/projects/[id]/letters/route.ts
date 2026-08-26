import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, letters, sheets } from "@/db/schema";
import { hasSameOrigin, requireProjectAccess } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { uploadValue } from "@/lib/upload";
import { letterFieldsSchema } from "@/lib/validation";

export async function POST(request: Request, context: RouteContext<"/api/projects/[id]/letters">) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const { id } = await context.params;
  const access = await requireProjectAccess(id, true);
  if (!access) return jsonError("دسترسی نوشتن ندارید", 403);
  try {
    const form = await request.formData();
    const parsed = letterFieldsSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success)
      return jsonError(parsed.error.issues[0]?.message || "اطلاعات نامه نامعتبر است");
    const sheet = await db.query.sheets.findFirst({
      where: and(eq(sheets.id, parsed.data.sheetId), eq(sheets.projectId, id)),
    });
    if (!sheet) return jsonError("شیت انتخاب‌شده معتبر نیست");
    const [letterFile, paraph, attachment] = await Promise.all([
      uploadValue(form.get("letterFile"), true),
      uploadValue(form.get("paraph")),
      uploadValue(form.get("attachment")),
    ]);
    const created = await db.transaction(async (tx) => {
      const [letter] = await tx
        .insert(letters)
        .values({ projectId: id, createdBy: access.user.id, ...parsed.data })
        .returning();
      const uploads = [
        letterFile && { letterId: letter.id, kind: "letter" as const, ...letterFile },
        paraph && { letterId: letter.id, kind: "paraph" as const, ...paraph },
        attachment && { letterId: letter.id, kind: "attachment" as const, ...attachment },
      ].filter(Boolean) as (typeof files.$inferInsert)[];
      if (uploads.length) await tx.insert(files).values(uploads);
      return letter;
    });
    return Response.json({ ok: true, letter: created });
  } catch (error) {
    const message =
      error instanceof Error && error.message.includes("فایل")
        ? error.message
        : "ثبت نامه انجام نشد";
    return jsonError(message);
  }
}
