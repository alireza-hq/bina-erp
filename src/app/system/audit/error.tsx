"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="admin-surface">
      <p role="alert">رویدادها دریافت نشد.</p>
      <button className="secondary-button" onClick={reset}>
        تلاش دوباره
      </button>
    </section>
  );
}
