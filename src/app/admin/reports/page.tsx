import Link from "next/link";
import { ZodError } from "zod";
import { requireRole } from "@/lib/auth";
import { BusinessReportFilters } from "@/components/business-report-filters";
import { ReportExportActions } from "@/components/report-export-actions";
import {
  REPORT_ROLES,
  parseBusinessReportQuery,
  reportHref,
  reportHours,
  groupLabels,
  type BusinessReportQuery,
} from "@/lib/business-report-query";
import { getBusinessReport } from "@/lib/business-reports";
import { shiftDate, weekStart, todayInTehran, isCalendarDate } from "@/lib/work-reporting";
import { formatJalaliDate } from "@/lib/jalali";
import { toPersianDigits } from "@/lib/persian";
export const metadata = { title: "گزارش‌های سازمان" };
const hours = (value: string) => toPersianDigits(reportHours(value));
function Pager({
  query,
  count,
  group = false,
}: {
  query: BusinessReportQuery;
  count: number;
  group?: boolean;
}) {
  const page = group ? query.groupPage : query.page;
  const pages = Math.max(1, Math.ceil(count / query.pageSize));
  return (
    <nav className="admin-actions" aria-label={group ? "صفحه‌بندی گروه‌ها" : "صفحه‌بندی ردیف‌ها"}>
      {page > 1 && (
        <Link
          className="secondary-button"
          href={reportHref(query, group ? { groupPage: page - 1 } : { page: page - 1 })}
        >
          صفحه قبل
        </Link>
      )}
      <span>
        صفحه {toPersianDigits(page)} از {toPersianDigits(pages)} —{" "}
        {count && page <= pages
          ? `${toPersianDigits((page - 1) * query.pageSize + 1)}–${toPersianDigits(Math.min(page * query.pageSize, count))}`
          : "۰"}{" "}
        از {toPersianDigits(count)}
      </span>
      {page < pages && (
        <Link
          className="secondary-button"
          href={reportHref(query, group ? { groupPage: page + 1 } : { page: page + 1 })}
        >
          صفحه بعد
        </Link>
      )}
      {page > pages && (
        <Link href={reportHref(query, group ? { groupPage: 1 } : { page: 1 })}>
          بازگشت به صفحه اول
        </Link>
      )}
    </nav>
  );
}
export default async function Page({ searchParams }: PageProps<"/admin/reports">) {
  await requireRole(...REPORT_ROLES);
  let query: BusinessReportQuery;
  try {
    query = parseBusinessReportQuery(await searchParams);
  } catch (error) {
    return (
      <section className="admin-surface">
        <p role="alert" className="form-alert">
          {error instanceof ZodError ? error.issues[0]?.message : "فیلتر نامعتبر است"}
        </p>
        <Link href="/admin/reports">بازگشت به هفته جاری</Link>
      </section>
    );
  }
  const result = await getBusinessReport(query);
  const current = weekStart(todayInTehran());
  const weeks = [
    ["هفته قبل", shiftDate(weekStart(query.from), -7)],
    ["هفته جاری", current],
    ["هفته بعد", shiftDate(weekStart(query.from), 7)],
  ];
  return (
    <>
      <header className="page-title">
        <div>
          <h1>گزارش‌های سازمان</h1>
          <p>
            {formatJalaliDate(query.from)} تا {formatJalaliDate(query.to)} (شامل هر دو روز)
          </p>
        </div>
      </header>
      <nav className="admin-actions report-week-nav" aria-label="انتخاب هفته">
        {weeks
          .filter(([, from]) => isCalendarDate(from) && isCalendarDate(shiftDate(from, 6)))
          .map(([label, from]) => (
            <Link
              className="secondary-button"
              key={label}
              href={reportHref(query, { from, to: shiftDate(from, 6), page: 1, groupPage: 1 })}
            >
              {label}
            </Link>
          ))}
      </nav>
      <p className="admin-help">
        هفته: شنبه تا جمعه. واحد سازمانی بر اساس واحد فعلی کارمند است؛ سابقه انتقال واحد در گزارش
        لحاظ نمی‌شود.
      </p>
      <BusinessReportFilters key={JSON.stringify(query)} query={query} />
      <ReportExportActions query={query} />
      <section className="admin-surface">
        <div className="report-summary">
          <strong>جمع کل فیلترشده: {hours(result.totalHours)} نفر-ساعت</strong>
          <span>{toPersianDigits(result.entryCount)} ردیف</span>
        </div>
        <p className="admin-help">جمع کل مربوط به تمام نتایج فیلترشده است، نه فقط صفحه جاری.</p>
      </section>
      {query.groupBy && (
        <section className="admin-surface">
          <h2>خلاصه گروه‌بندی</h2>
          {!result.groupCount ? (
            <p className="admin-empty">برای این بازه و فیلترها گزارشی ثبت نشده است.</p>
          ) : (
            <>
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{groupLabels[query.groupBy]}</th>
                      <th>جمع گروه اول</th>
                      {query.groupBySecondary && <th>{groupLabels[query.groupBySecondary]}</th>}
                      <th>نفر-ساعت</th>
                      <th>تعداد ردیف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.groups.map((g) => (
                      <tr key={`${g.primaryKey}/${g.secondaryKey}`}>
                        <td>
                          {query.groupBy === "date"
                            ? formatJalaliDate(g.primaryLabel)
                            : g.primaryLabel}
                        </td>
                        <td>{hours(g.primaryHours)}</td>
                        {query.groupBySecondary && (
                          <td>
                            {query.groupBySecondary === "date"
                              ? formatJalaliDate(g.secondaryLabel)
                              : g.secondaryLabel}
                          </td>
                        )}
                        <td>{hours(g.totalHours)}</td>
                        <td>{toPersianDigits(g.entryCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="admin-help">
                جمع گروه اول شامل همه زیرگروه‌ها در تمام صفحات است و ممکن است در چند ردیف تکرار شود؛
                این ستون را دوباره جمع نکنید.
              </p>
            </>
          )}
          <Pager query={query} count={result.groupCount} group />
        </section>
      )}
      <section className="admin-surface">
        <h2>جزئیات فعالیت‌ها</h2>
        {!result.entryCount ? (
          <p className="admin-empty">برای این بازه و فیلترها گزارشی ثبت نشده است.</p>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  {[
                    "تاریخ",
                    "کارمند",
                    "واحد فعلی",
                    "پروژه",
                    "فایل پروژه",
                    "شرح فعالیت",
                    "نفر-ساعت",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.entries.map((row) => (
                  <tr key={row.id}>
                    <td>{formatJalaliDate(row.date)}</td>
                    <td>{row.employee}</td>
                    <td>{row.department}</td>
                    <td>{row.project}</td>
                    <td>{row.projectFile}</td>
                    <td className="report-description">{row.description}</td>
                    <td>{hours(row.manHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager query={query} count={result.entryCount} />
      </section>
    </>
  );
}
