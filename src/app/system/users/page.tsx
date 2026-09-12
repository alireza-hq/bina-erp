import { asc } from "drizzle-orm";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { userAdminColumns } from "@/lib/admin-api";
import { UserManager } from "@/components/user-manager";
export const metadata = { title: "مدیریت کاربران" };
export default async function UsersPage() {
  const actor = await requireRole("IT_ADMIN");
  const [rows, units] = await Promise.all([
    db.select(userAdminColumns).from(users).orderBy(asc(users.displayName)),
    db
      .select({ id: departments.id, name: departments.name, isActive: departments.isActive })
      .from(departments)
      .orderBy(asc(departments.name)),
  ]);
  return (
    <>
      <header className="page-title">
        <div>
          <h1>مدیریت کاربران</h1>
          <p>نقش، واحد سازمانی و دسترسی به سامانه</p>
        </div>
      </header>
      <UserManager
        actorId={actor.id}
        initialRows={rows.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() || null }))}
        departments={units}
      />
    </>
  );
}
