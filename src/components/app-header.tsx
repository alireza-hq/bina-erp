"use client";
import { ChevronDown, FolderKanban, LogOut, Settings2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toPersianDigits } from "@/lib/persian";

export function AppHeader({ user }: { user: { displayName: string; role: "admin" | "user" } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const admin = user.role !== "user";
  useEffect(() => {
    function close(event: PointerEvent) {
      if (!account.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function closeWithKeyboard(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeWithKeyboard);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", closeWithKeyboard);
    };
  }, []);
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
        <div className="account" ref={account}>
          <button
            type="button"
            className="account-trigger"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((current) => !current)}
          >
            <span className="account-avatar">{toPersianDigits(user.displayName.slice(0, 1))}</span>
            <span className="account-copy">
              <strong>{toPersianDigits(user.displayName)}</strong>
              <small>{admin ? "مدیر" : "کاربر"}</small>
            </span>
            <ChevronDown size={15} className="account-chevron" aria-hidden="true" />
          </button>
          {accountOpen && (
            <div className="account-menu" role="menu">
              <button className="signout-button" onClick={logout} disabled={busy} role="menuitem">
                <LogOut size={16} />
                <span>خروج</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
