import { eq } from "drizzle-orm";
import { db } from "@/db";
import { files, letters } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth";
export async function GET(_request: Request, context: RouteContext<"/api/files/[id]">) {
  const { id } = await context.params;
  const rows = await db
    .select({ file: files, projectId: letters.projectId })
    .from(files)
    .innerJoin(letters, eq(files.letterId, letters.id))
    .where(eq(files.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return new Response("Not found", { status: 404 });
  if (!(await requireProjectAccess(row.projectId)))
    return new Response("Forbidden", { status: 403 });
  return new Response(new Uint8Array(row.file.data), {
    headers: {
      "Content-Type": row.file.mimeType,
      "Content-Length": String(row.file.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.file.originalName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
