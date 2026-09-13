"use client";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="admin-surface">
      <p role="alert">اطلاعات دریافت نشد. اتصال یا وضعیت ورود را بررسی کنید.</p>
      <button className="secondary-button" onClick={reset}>
        تلاش دوباره
      </button>
    </section>
  );
}
