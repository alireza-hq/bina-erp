import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "خانه" };
export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="app-frame">
      <AppHeader user={{ displayName: user.displayName, role: user.role }} />
      <main className="content">
        <header className="page-title">
          <div>
            <h1>سامانه گزارش کار کارکنان</h1>
            <p>خوش آمدید، {user.displayName}</p>
            <p dir="ltr">{user.username}</p>
          </div>
        </header>
        <section className="blank-state">
          <h2>زیرساخت سامانه آماده است</h2>
          <p>قابلیت‌های گزارش کار در مرحله بعد اضافه خواهند شد.</p>
        </section>
      </main>
    </div>
  );
}
