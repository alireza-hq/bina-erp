import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";
import { roleLabels } from "@/lib/roles";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "خانه" };
export default async function DashboardPage() {
  const user = await requireUser();
  const department = user.departmentId
    ? await db.query.departments.findFirst({ where: eq(departments.id, user.departmentId) })
    : null;
  return (
    <div className="app-frame">
      <AppHeader user={{ displayName: user.displayName, role: user.role }} />
      <main className="content">
        <header className="page-title">
          <div>
            <h1>سامانه گزارش کار کارکنان</h1>
            <p>خوش آمدید، {user.displayName}</p>
            <p dir="ltr">{user.username}</p>
            <p>
              {roleLabels[user.role]} ·{" "}
              {department
                ? `${department.name}${department.isActive ? "" : " (غیرفعال)"}`
                : "بدون واحد سازمانی"}
            </p>
          </div>
        </header>
        <section className="blank-state">
          <h2>گزارش کار روزانه</h2>
          <p>فعالیت‌های روزانه خود را ثبت کنید و گزارش‌های هفته را ببینید.</p>
          <div className="admin-actions dashboard-links">
            <Link href="/reports" className="secondary-button">
              گزارش کار من
            </Link>
            <Link href="/reports/new" className="primary-button">
              ثبت فعالیت
            </Link>
          </div>
          {user.role === "IT_ADMIN" && (
            <div className="admin-actions dashboard-links">
              <Link href="/system/users" className="secondary-button">
                کاربران
              </Link>
              <Link href="/system/departments" className="secondary-button">
                واحدها
              </Link>
              <Link href="/system/projects" className="secondary-button">
                پروژه‌ها
              </Link>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
