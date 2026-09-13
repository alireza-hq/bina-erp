export default function Loading() {
  return (
    <main className="content" aria-busy="true">
      <h1>داشبورد</h1>
      <p role="status">در حال دریافت خلاصه هفته…</p>
      <div className="metric-grid" aria-hidden="true">
        {[1, 2, 3].map((key) => (
          <div className="metric-card skeleton" key={key} />
        ))}
      </div>
    </main>
  );
}
