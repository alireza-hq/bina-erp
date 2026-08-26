"use client";
import { FolderKanban, LogOut, Settings2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toPersianDigits } from "@/lib/persian";

export function AppHeader({ user }: { user: { displayName: string; role: "admin" | "user" } }) {
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
          <Image src="/logo.png" alt="بینا" width={44} height={50} priority />
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
          <div className="account-profile">
            <span className="account-avatar">{toPersianDigits(user.displayName.slice(0, 1))}</span>
            <span className="account-copy">
              <strong>{toPersianDigits(user.displayName)}</strong>
              <small>{admin ? "مدیر" : "کاربر"}</small>
            </span>
          </div>
          <button className="signout-button" onClick={logout} disabled={busy} aria-label="خروج">
            <LogOut size={16} />
            <span>خروج</span>
          </button>
        </div>
      </div>
    </header>
  );
}
