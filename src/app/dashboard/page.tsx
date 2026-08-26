import { asc, count, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText, FolderKanban } from "lucide-react";
import { db } from "@/db";
import { letters, projectPermissions, projects } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { isAdmin, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "پروژه‌ها" };
export default async function DashboardPage() {
  const user = await requireUser();
  const allProjects = await db.select().from(projects).orderBy(asc(projects.name));
  const permissionRows = isAdmin(user)
    ? []
    : await db.select().from(projectPermissions).where(eq(projectPermissions.userId, user.id));
  const allowed = isAdmin(user)
    ? allProjects
    : allProjects.filter((project) => permissionRows.some((row) => row.projectId === project.id));
  const counts = allowed.length
    ? await db
        .select({ projectId: letters.projectId, total: count() })
        .from(letters)
        .where(
          inArray(
            letters.projectId,
            allowed.map((item) => item.id),
          ),
        )
        .groupBy(letters.projectId)
    : [];
  return (
    <div className="app-frame">
      <AppHeader user={user} />
      <main className="content">
        <header className="page-title">
          <div>
            <p className="kicker">فضای کاری</p>
            <h1>پروژه‌ها</h1>
            <p>پروژه‌های در دسترس و مکاتبات آن‌ها</p>
          </div>
        </header>
        {allowed.length ? (
          <div className="cards-grid">
            {allowed.map((project) => {
              return (
                <Link className="project-tile" href={`/projects/${project.id}`} key={project.id}>
                  <div className="tile-head">
                    <span className="tile-icon">
                      <FolderKanban size={21} />
                    </span>
                  </div>
                  <div>
                    <span className="project-code">{project.code}</span>
                    <h2>{project.name}</h2>
                  </div>
                  <div className="tile-foot">
                    <span>
                      <FileText size={15} />
                      {Number(
                        counts.find((row) => row.projectId === project.id)?.total || 0,
                      ).toLocaleString("fa-IR")}{" "}
                      نامه
                    </span>
                    <ArrowLeft size={18} />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="blank-state">
            <FolderKanban size={32} />
            <h2>پروژه‌ای برای شما تعریف نشده</h2>
            <p>برای دریافت دسترسی با مدیر سامانه تماس بگیرید.</p>
          </div>
        )}
      </main>
    </div>
  );
}
