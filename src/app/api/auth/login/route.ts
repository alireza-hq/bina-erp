import { authenticateDirectoryUser, DirectoryError } from "@/lib/ldap";
import { createSession, hasSameOrigin, syncDirectoryUser } from "@/lib/auth";
import { jsonError, parseJson } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { loginThrottle } from "@/lib/login-throttle";
import { operationalLog } from "@/lib/operational-log";
export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return jsonError("درخواست غیرمجاز است", 403);
  const parsed = await parseJson(request, loginSchema);
  if ("error" in parsed) return parsed.error;
  const attempt = loginThrottle.reserve(request, parsed.data.username);
  if ("retryAfter" in attempt) {
    const response = jsonError("تلاش‌های ورود بیش از حد است. کمی بعد دوباره تلاش کنید.", 429);
    response.headers.set("Retry-After", String(attempt.retryAfter));
    return response;
  }
  let result: "success" | "failure" | "unavailable" = "unavailable";
  try {
    const user = await authenticateDirectoryUser(parsed.data.username, parsed.data.password).then(
      syncDirectoryUser,
    );
    if (!user.isActive) {
      result = "failure";
      return jsonError("این حساب غیرفعال است.", 403);
    }
    await createSession(user.id);
    result = "success";
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DirectoryError && error.kind === "credentials") {
      result = "failure";
      return jsonError("نام کاربری یا رمز عبور صحیح نیست.", 401);
    }
    operationalLog(
      error instanceof DirectoryError ? `ldap.${error.kind}` : "auth.login_service_failed",
      error,
    );
    return jsonError("سرویس ورود موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.", 503);
  } finally {
    attempt.finish(result);
  }
}
