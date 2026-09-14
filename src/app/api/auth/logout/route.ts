import { destroySession, hasSameOrigin } from "@/lib/auth";
import { jsonError } from "@/lib/api";
import { operationalLog } from "@/lib/operational-log";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  try {
    await destroySession();
  } catch (error) {
    operationalLog("auth.logout_failed", error);
    return jsonError("خروج انجام نشد. دوباره تلاش کنید.", 503);
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
