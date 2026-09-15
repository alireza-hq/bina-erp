import { requireApiRole } from "@/lib/auth";
import { APP_ROLES } from "@/lib/roles";
import { parseJson, jsonError } from "@/lib/api";
import { decisionSchema } from "@/lib/approval-model";
import { decideWorkEntry } from "@/lib/approvals";
import { WorkEntryError } from "@/lib/work-entries";
import { operationalLog } from "@/lib/operational-log";
import { idSchema } from "@/lib/validation";
export async function POST(r: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireApiRole(r, ...APP_ROLES);
  if ("error" in actor) return actor.error;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return jsonError("شناسه نامعتبر است");
  const parsed = await parseJson(r, decisionSchema);
  if ("error" in parsed) return parsed.error;
  try {
    return Response.json(
      { ok: true, data: await decideWorkEntry(actor.user.id, id, parsed.data) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    if (e instanceof WorkEntryError) return jsonError(e.message, e.status);
    operationalLog("approval.failed", e);
    return jsonError("عملیات تأیید انجام نشد؛ دوباره تلاش کنید", 500);
  }
}
