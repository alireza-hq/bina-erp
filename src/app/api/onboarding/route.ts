import { getCurrentUser, hasSameOrigin } from "@/lib/auth";
import { parseJson, jsonError } from "@/lib/api";
import { profileSchema } from "@/lib/validation";
import { completeProfile } from "@/lib/onboarding";
import { WorkEntryError } from "@/lib/work-entries";
import { operationalLog } from "@/lib/operational-log";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  try {
    const user = await getCurrentUser();
    if (!user) return jsonError("ابتدا وارد شوید", 401);
    const parsed = await parseJson(request, profileSchema);
    if ("error" in parsed) return parsed.error;
    await completeProfile(user.id, parsed.data);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof WorkEntryError) return jsonError(e.message, e.status);
    operationalLog("profile.failed", e);
    return jsonError("تکمیل مشخصات انجام نشد؛ دوباره تلاش کنید", 500);
  }
}
