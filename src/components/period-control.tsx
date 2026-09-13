"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReportingPeriod } from "@/lib/reporting-periods";
import { formatJalaliDate } from "@/lib/jalali";
export function PeriodControl({ initial }: { initial: ReportingPeriod }) {
  const [period, setPeriod] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false),
    router = useRouter();
  async function change() {
    if (pending.current) return;
    const lock = period.status === "OPEN";
    if (
      !window.confirm(
        `آیا از ${lock ? "قفل کردن" : "باز کردن"} گزارش‌های همه کارکنان در هفته ${formatJalaliDate(period.weekStart)} تا ${formatJalaliDate(period.weekEnd)} مطمئن هستید؟`,
      )
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/reporting-periods/${period.weekStart}/${lock ? "lock" : "unlock"}`,
        { method: "POST" },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "عملیات انجام نشد");
      setPeriod(body.data);
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "خطای ارتباط");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="admin-surface">
      <p role="status">
        {period.status === "LOCKED" ? "این دوره قفل شده است" : "این هفته باز است"} —{" "}
        {formatJalaliDate(period.weekStart)} تا {formatJalaliDate(period.weekEnd)}
      </p>
      {period.lockedAt && (
        <p>
          قفل‌شده توسط {period.lockedByName} در{" "}
          {new Intl.DateTimeFormat("fa-IR", {
            timeZone: "Asia/Tehran",
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(period.lockedAt))}
        </p>
      )}
      <button className="secondary-button" onClick={change} disabled={busy}>
        {busy ? "در حال ثبت…" : period.status === "OPEN" ? "قفل کردن هفته" : "باز کردن هفته"}
      </button>
      <p className="admin-help">
        این اقدام کل هفته را برای همه کارکنان و پروژه‌ها، مستقل از فیلترهای گزارش، تغییر می‌دهد.
        قفل، ویرایش فعالیت‌ها را می‌بندد؛ واحد فعلی کارمند و نام‌های مرجع را ثابت نمی‌کند.
      </p>
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
    </section>
  );
}
