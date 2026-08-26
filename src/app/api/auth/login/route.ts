import { authenticateDirectoryUser } from "@/lib/ldap";
import { createSession, hasSameOrigin, syncDirectoryUser } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { loginSchema } from "@/lib/validation";

const attempts = new Map<string, { count: number; resetAt: number }>();
function attemptKey(request: Request, username: string) {
  return `${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}:${username.toLowerCase()}`;
}
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const parsed = await parseJson(request, loginSchema);
  if ("error" in parsed) return parsed.error;
  const key = attemptKey(request, parsed.data.username);
  const now = Date.now();
  const record = attempts.get(key);
  if (record && record.resetAt > now && record.count >= 5)
    return jsonError("تلاش‌های ورود بیش از حد است. ۱۵ دقیقه دیگر دوباره تلاش کنید.", 429);
  try {
    const user = await authenticateDirectoryUser(parsed.data.username, parsed.data.password).then(
      syncDirectoryUser,
    );
    if (!user.active) return jsonError("این حساب غیرفعال است.", 403);
    await createSession(user.id);
    attempts.delete(key);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    const current =
      record && record.resetAt > now ? record : { count: 0, resetAt: now + 15 * 60_000 };
    current.count += 1;
    attempts.set(key, current);
    return jsonError("نام کاربری یا رمز عبور صحیح نیست.", 401);
  }
}
