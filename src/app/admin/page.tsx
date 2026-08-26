import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { projectPermissions, projects, users } from "@/db/schema";
import { AdminPanel } from "@/components/admin-panel";
import { AppHeader } from "@/components/app-header";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "مدیریت" };
export default async function AdminPage() {
  const actor = await requireAdmin();
  const [allUsers, allProjects, permissions] = await Promise.all([
    db.select().from(users).orderBy(asc(users.displayName)),
    db.select().from(projects).orderBy(asc(projects.name)),
    db.select().from(projectPermissions),
  ]);
  return (
    <div className="app-frame">
      <AppHeader user={actor} />
      <main className="content">
        <header className="page-title">
          <div>
            <p className="kicker">پنل مدیریت</p>
            <h1>مدیریت سامانه</h1>
            <p>کاربران، پروژه‌ها و سطح دسترسی‌ها</p>
          </div>
        </header>
        <AdminPanel
          actor={actor}
          users={allUsers.map((user) => ({
            id: user.id,
            username: user.username,
            displayName: user.displayName,
            email: user.email,
            role: user.role,
            active: user.active,
          }))}
          projects={allProjects.map((project) => ({
            id: project.id,
            name: project.name,
            code: project.code,
          }))}
          permissions={permissions.map((permission) => ({
            projectId: permission.projectId,
            userId: permission.userId,
            permission: permission.permission,
          }))}
        />
      </main>
    </div>
  );
}
