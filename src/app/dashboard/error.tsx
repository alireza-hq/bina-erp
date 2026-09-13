"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="content">
      <section className="admin-surface">
        <p role="alert">دریافت داشبورد انجام نشد. اتصال و وضعیت ورود را بررسی کنید.</p>
        <button className="secondary-button" onClick={reset}>
          تلاش دوباره
        </button>
      </section>
    </main>
  );
}
