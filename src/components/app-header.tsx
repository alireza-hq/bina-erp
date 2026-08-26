"use client";
import { FolderKanban, LogOut, Settings2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function AppHeader({
  user,
}: {
  user: { displayName: string; role: "super_admin" | "admin" | "user" };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const admin = user.role !== "user";
  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/dashboard" className="wordmark">
          <Image src="/logo.png" alt="بینا" width={32} height={36} priority />
          <span>بینا</span>
        </Link>
        <nav className="main-nav" aria-label="ناوبری اصلی">
          <Link
            className={
              pathname.startsWith("/dashboard") || pathname.startsWith("/projects") ? "active" : ""
            }
            href="/dashboard"
          >
            <FolderKanban size={17} />
            پروژه‌ها
          </Link>
          {admin && (
            <Link className={pathname.startsWith("/admin") ? "active" : ""} href="/admin">
              <Settings2 size={17} />
              مدیریت
            </Link>
          )}
        </nav>
        <div className="account">
          <span className="account-avatar">{user.displayName.slice(0, 1)}</span>
          <span className="account-name">{user.displayName}</span>
          <button className="icon-button" onClick={logout} disabled={busy} aria-label="خروج">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
