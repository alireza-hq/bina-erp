"use client";
import { useRef, useState } from "react";
import type { BusinessReportQuery } from "@/lib/business-report-query";
import { exportFilename, exportHref, type ExportMode } from "@/lib/report-export-query";
export function ReportExportActions({ query }: { query: BusinessReportQuery }) {
  const running = useRef(false);
  const [busy, setBusy] = useState<ExportMode | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function download(mode: ExportMode) {
    if (running.current) return;
    running.current = true;
    setBusy(mode);
    setError("");
    setMessage("");
    try {
      const response = await fetch(exportHref(query, mode));
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.message || "خروجی دریافت نشد");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFilename(query, mode);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage("فایل Excel آماده شد؛ دانلود مرورگر را بررسی کنید.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "خروجی Excel تولید نشد");
    } finally {
      running.current = false;
      setBusy(null);
    }
  }
  return (
    <section className="admin-surface" aria-label="خروجی Excel">
      <div className="admin-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!!busy}
          onClick={() => download("details")}
        >
          {busy === "details" ? "در حال تولید…" : "Excel تفصیلی"}
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!!busy}
          onClick={() => download("summary")}
        >
          {busy === "summary" ? "در حال تولید…" : "Excel خلاصه"}
        </button>
      </div>
      <p className="admin-help">
        خروجی بر اساس فیلترهای اعمال‌شده است، شامل تمام صفحات (حداکثر ۲۰٬۰۰۰ ردیف منبع). بدون
        گروه‌بندی، خلاصه شامل جمع کل است.
      </p>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
    </section>
  );
}
