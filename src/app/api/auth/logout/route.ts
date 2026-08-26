import { destroySession, hasSameOrigin } from "@/lib/auth";
import { jsonError } from "@/lib/api";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  await destroySession();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
