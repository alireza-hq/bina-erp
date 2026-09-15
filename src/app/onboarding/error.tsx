"use client";
export default function ReportsError({ reset }: { reset: () => void }) {
  return (
    <section className="admin-surface">
      <p role="alert">بارگذاری گزارش کار انجام نشد. اتصال یا وضعیت ورود خود را بررسی کنید.</p>
      <button onClick={reset} className="secondary-button">
        تلاش دوباره
      </button>
    </section>
  );
}
