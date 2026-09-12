import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sessions, users, type AppUser } from "@/db/schema";
import type { DirectoryUser } from "./ldap";
import type { AppRole } from "@/lib/roles";
import { jsonError } from "@/lib/api";

const COOKIE_NAME = "bina_session";
const SESSION_DAYS = 7;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");
  return value;
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function signature(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}
function signedToken(raw: string) {
  return `${raw}.${signature(raw)}`;
}
function verifySignedToken(value: string) {
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;
  const raw = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1), "base64url");
  const expected = Buffer.from(signature(raw), "base64url");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected) ? raw : null;
}

export async function syncDirectoryUser(directoryUser: DirectoryUser) {
  const existing = await db.query.users.findFirst({
    where: or(
      eq(users.ldapId, directoryUser.ldapId),
      eq(users.username, directoryUser.username.toLowerCase()),
    ),
  });
  if (existing) {
    const [updated] = await db
      .update(users)
      .set({
        ldapId: directoryUser.ldapId,
        username: directoryUser.username,
        displayName: directoryUser.displayName,
        email: directoryUser.email,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated;
  }
  try {
    const [created] = await db
      .insert(users)
      .values({ ...directoryUser, role: "EMPLOYEE" })
      .returning();
    return created;
  } catch {
    const user = await db.query.users.findFirst({ where: eq(users.ldapId, directoryUser.ldapId) });
    if (!user) throw new Error("Unable to synchronize directory user");
    return user;
  }
}
export async function createSession(userId: string) {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user?.isActive) throw new Error("Inactive or missing application user");
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.insert(sessions).values({ tokenHash: digest(raw), userId, expiresAt });
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  });
  (await cookies()).set(COOKIE_NAME, signedToken(raw), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}
export async function destroySession() {
  const store = await cookies();
  const value = store.get(COOKIE_NAME)?.value;
  const raw = value ? verifySignedToken(value) : null;
  if (raw) await db.delete(sessions).where(eq(sessions.tokenHash, digest(raw)));
  store.delete(COOKIE_NAME);
}
export async function getCurrentUser(): Promise<AppUser | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  const raw = value ? verifySignedToken(value) : null;
  if (!raw) return null;
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(
        eq(sessions.tokenHash, digest(raw)),
        gt(sessions.expiresAt, new Date()),
        eq(users.isActive, true),
      ),
    )
    .limit(1);
  return rows[0]?.user ?? null;
}
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
export async function requireRole(...roles: [AppRole, ...AppRole[]]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
export async function requireApiRole(request: Request, ...roles: [AppRole, ...AppRole[]]) {
  if (!["GET", "HEAD"].includes(request.method) && !hasSameOrigin(request))
    return { error: jsonError("درخواست غیرمجاز است", 403) } as const;
  const user = await getCurrentUser();
  if (!user) return { error: jsonError("ابتدا وارد سامانه شوید", 401) } as const;
  if (!roles.includes(user.role)) return { error: jsonError("دسترسی کافی ندارید", 403) } as const;
  return { user } as const;
}
export function hasSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  const allowed = [new URL(request.url).origin];
  // Explicit public URL supports TLS termination without trusting forwarded headers.
  if (process.env.NEXT_PUBLIC_APP_URL)
    allowed.push(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
  return allowed.includes(origin);
}
