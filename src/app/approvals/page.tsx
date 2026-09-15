import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getApprovals } from "@/lib/approvals";
import { approvalQuerySchema, statusLabels } from "@/lib/approval-model";
import { ApprovalActions } from "@/components/approval-actions";
import { formatJalaliDate } from "@/lib/jalali";
import { reportHours } from "@/lib/business-report-query";
export const metadata = { title: "تأیید گزارش‌ها" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const parsed = approvalQuerySchema.safeParse(await searchParams);
  if (!parsed.success)
    return (
      <p role="alert">
        فیلتر نامعتبر است. <Link href="/approvals">بازگشت</Link>
      </p>
    );
  const result = await getApprovals(user.id, parsed.data);
  return (
    <>
      <header className="page-title">
        <h1>تأیید گزارش‌ها</h1>
      </header>
      <nav className="admin-actions">
        <Link href="/approvals">در انتظار اقدام من</Link>
        <Link href="/approvals?view=history">تاریخچه تصمیم‌های من</Link>
      </nav>
      <p>هر مرحله نیازمند اقدام مستقل است؛ حتی اگر مدیر هر دو مرحله یک نفر باشد.</p>
      <section className="admin-surface">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                {[
                  "کارمند / واحد",
                  "تاریخ",
                  "پروژه / گزارش",
                  "نفر-ساعت",
                  "توضیحات / ملاحظات",
                  "مرحله / وضعیت",
                  "عملیات",
                ].map((v) => (
                  <th key={v}>{v}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.employee}
                    <small>{row.department}</small>
                  </td>
                  <td>{formatJalaliDate(row.date)}</td>
                  <td>
                    <bdi>{row.project}</bdi>
                    <small>{row.report}</small>
                  </td>
                  <td>{reportHours(row.manHours)}</td>
                  <td>{row.description || "—"}</td>
                  <td>
                    {row.stage === "DEPARTMENT" ? "مدیر واحد" : "مدیر پروژه"}
                    <small>
                      {result.view === "history"
                        ? row.decision === "APPROVED"
                          ? "تأیید"
                          : "رد"
                        : statusLabels[row.status as keyof typeof statusLabels]}
                    </small>
                  </td>
                  <td>
                    {result.view === "pending" ? (
                      <ApprovalActions id={row.id} stage={row.stage} />
                    ) : (
                      <>
                        <span>
                          {row.actedAt
                            ? new Date(row.actedAt).toLocaleString("fa-IR", {
                                timeZone: "Asia/Tehran",
                              })
                            : ""}
                        </span>
                        <p>{row.reason}</p>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!result.rows.length && <p className="admin-empty">درخواستی در این فهرست وجود ندارد.</p>}
        <nav className="admin-actions">
          {result.page > 1 && (
            <Link href={`/approvals?view=${result.view}&page=${result.page - 1}`}>صفحه قبل</Link>
          )}
          <span>{result.count} مورد</span>
          {result.page * 50 < result.count && (
            <Link href={`/approvals?view=${result.view}&page=${result.page + 1}`}>صفحه بعد</Link>
          )}
        </nav>
      </section>
    </>
  );
}
