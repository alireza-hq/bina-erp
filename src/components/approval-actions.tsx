"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function ApprovalActions({ id, stage }: { id: string; stage: "DEPARTMENT" | "PROJECT" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  async function decide(decision: "APPROVED" | "REJECTED") {
    if (busy) return;
    if (decision === "REJECTED" && !reason.trim()) {
      setError("دلیل رد را وارد کنید");
      return;
    }
    if (
      !window.confirm(
        decision === "APPROVED" ? "این مرحله تأیید شود؟" : "گزارش با دلیل نوشته‌شده رد شود؟",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/approvals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          decision,
          ...(decision === "REJECTED" ? { rejectionReason: reason } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.message || "عملیات انجام نشد");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ارتباط");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button className="primary-button" disabled={busy} onClick={() => decide("APPROVED")}>
        تأیید
      </button>
      <label className="field">
        دلیل رد
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={1000}
          disabled={busy}
        />
      </label>
      <button className="secondary-button" disabled={busy} onClick={() => decide("REJECTED")}>
        رد گزارش
      </button>
      {busy && <small role="status">در حال ثبت تصمیم…</small>}
      {error && (
        <p role="alert" className="form-alert">
          {error}
        </p>
      )}
    </div>
  );
}
