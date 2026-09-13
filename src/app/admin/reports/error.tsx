"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="admin-surface">
      <p role="alert">گزارش دریافت نشد. دوباره تلاش کنید.</p>
      <button className="secondary-button" onClick={reset}>
        تلاش دوباره
      </button>
    </section>
  );
}
