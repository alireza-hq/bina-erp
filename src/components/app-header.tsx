"use client";
import { ChevronDown, House, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toPersianDigits } from "@/lib/persian";
import { roleLabels, type AppRole } from "@/lib/roles";

export function AppHeader({ user }: { user: { displayName: string; role: AppRole } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
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
    try {
      setError("");
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("خروج انجام نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/dashboard" className="wordmark">
          سامانه گزارش کار کارکنان
        </Link>
        <nav className="main-nav" aria-label="ناوبری اصلی">
          <Link className={pathname.startsWith("/dashboard") ? "active" : ""} href="/dashboard">
            <House size={17} />
            خانه
          </Link>
          {user.role === "IT_ADMIN" &&
            [
              ["/system/users", "کاربران"],
              ["/system/departments", "واحدها"],
              ["/system/projects", "پروژه‌ها"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className={pathname.startsWith(href) ? "active" : ""}>
                {label}
              </Link>
            ))}
        </nav>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
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
              <small>{roleLabels[user.role]}</small>
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
