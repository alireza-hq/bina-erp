import Link from "next/link";
import { ZodError } from "zod";
import { requireRole } from "@/lib/auth";
import { getAuditLogs } from "@/lib/audit-viewer";
import { parseAuditQuery, auditHref } from "@/lib/audit-query";
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  auditActionLabels,
  auditEntityLabels,
  type AuditEntity,
} from "@/lib/audit-model";
export const metadata = { title: "رویدادهای سیستم" };
export default async function Page({ searchParams }: PageProps<"/system/audit">) {
  await requireRole("IT_ADMIN");
  let query;
  try {
    query = parseAuditQuery(await searchParams);
  } catch (error) {
    return (
      <section className="admin-surface">
        <p role="alert">
          {error instanceof ZodError ? error.issues[0].message : "فیلتر نامعتبر است"}
        </p>
        <Link href="/system/audit">بازنشانی فیلترها</Link>
      </section>
    );
  }
  const result = await getAuditLogs(query);
  return (
    <>
      <header className="page-title">
        <h1>رویدادهای سیستم</h1>
      </header>
      <form className="admin-surface" method="GET">
        <div className="business-filter-grid">
          <label>
            از تاریخ (میلادی)
            <input type="date" name="from" defaultValue={query.from} />
          </label>
          <label>
            تا تاریخ (میلادی)
            <input type="date" name="to" defaultValue={query.to} />
          </label>
          <label>
            عامل (نام / نام کاربری)
            <input name="actor" maxLength={100} defaultValue={query.actor} />
          </label>
          <label>
            عملیات
            <select name="action" defaultValue={query.action}>
              <option value="">همه</option>
              {AUDIT_ACTIONS.map((a) => (
                <option key={a} value={a}>
                  {auditActionLabels[a]}
                </option>
              ))}
            </select>
          </label>
          <label>
            نوع موجودیت
            <select name="entityType" defaultValue={query.entityType}>
              <option value="">همه</option>
              {AUDIT_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {auditEntityLabels[e]}
                </option>
              ))}
            </select>
          </label>
          <label>
            تعداد در صفحه
            <select name="pageSize" defaultValue={query.pageSize}>
              {[25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button className="primary-button">اعمال فیلتر</button>
      </form>
      <section className="admin-surface">
        <p>{result.count} رویداد — زمان‌ها بر اساس تهران؛ بازه شامل روز پایان است.</p>
        {!result.rows.length ? (
          <p className="admin-empty">رویدادی در این صفحه پیدا نشد.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  {["زمان", "عامل", "عملیات", "موجودیت", "جزئیات تغییر"].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {new Intl.DateTimeFormat("fa-IR", {
                        timeZone: "Asia/Tehran",
                        dateStyle: "short",
                        timeStyle: "medium",
                      }).format(new Date(row.createdAt))}
                    </td>
                    <td>{row.actor}</td>
                    <td>{auditActionLabels[row.action]}</td>
                    <td>
                      {auditEntityLabels[row.entityType as AuditEntity] || row.entityType}
                      <small style={{ display: "block" }}>{row.entityId}</small>
                    </td>
                    <td>
                      <details>
                        <summary>قبل / بعد</summary>
                        <pre
                          dir="ltr"
                          style={{
                            whiteSpace: "pre-wrap",
                            maxWidth: 600,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {JSON.stringify({ before: row.oldData, after: row.newData }, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="admin-actions" aria-label="صفحه‌بندی رویدادها">
          {query.page > 1 && <Link href={auditHref(query, query.page - 1)}>صفحه قبل</Link>}
          <span>
            صفحه {query.page} از {Math.max(1, Math.ceil(result.count / query.pageSize))}
          </span>
          {query.page * query.pageSize < result.count && (
            <Link href={auditHref(query, query.page + 1)}>صفحه بعد</Link>
          )}
          {query.page > 1 && <Link href={auditHref(query, 1)}>صفحه اول</Link>}
        </nav>
      </section>
    </>
  );
}
