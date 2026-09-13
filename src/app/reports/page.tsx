import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOwnWorkWeek } from "@/lib/work-entries";
import { displayHours, isCalendarDate, shiftDate, todayInTehran } from "@/lib/work-reporting";
import { formatJalaliDate } from "@/lib/jalali";
import { toPersianDigits } from "@/lib/persian";
export const metadata = { title: "گزارش کار من" };
export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const user = await requireUser();
  const { week } = await searchParams;
  const today = todayInTehran();
  const selected = week === undefined ? today : week;
  if (typeof selected !== "string" || !isCalendarDate(selected)) notFound();
  const report = await getOwnWorkWeek(user.id, selected);
  const previous = shiftDate(report.start, -7),
    next = shiftDate(report.start, 7);
  return (
    <>
      <header className="page-title">
        <div>
          <h1>گزارش کار من</h1>
          <p>
            {formatJalaliDate(report.start)} تا {formatJalaliDate(shiftDate(report.start, 6))}
          </p>
        </div>
        <Link className="primary-button" href="/reports/new">
          ثبت گزارش کار
        </Link>
      </header>
      <nav className="admin-actions report-week-nav" aria-label="انتخاب هفته">
        {isCalendarDate(previous) && (
          <Link className="secondary-button" href={`/reports?week=${previous}`}>
            هفته قبل
          </Link>
        )}
        <Link className="secondary-button" href="/reports">
          هفته جاری
        </Link>
        {next <= today && isCalendarDate(next) && (
          <Link className="secondary-button" href={`/reports?week=${next}`}>
            هفته بعد
          </Link>
        )}
      </nav>
      <section className="admin-surface">
        <p
          className={`period-banner ${report.period.status === "LOCKED" ? "locked" : "open"}`}
          role="status"
        >
          {report.period.status === "LOCKED"
            ? "این دوره قفل شده است؛ گزارش‌ها فقط قابل مشاهده هستند."
            : "این هفته باز است"}
        </p>
        <div className="report-summary">
          <strong>
            جمع هفته: {toPersianDigits(displayHours(report.totalHundredths))} نفر-ساعت
          </strong>
          <span>{toPersianDigits(report.count)} ردیف فعالیت</span>
        </div>
        {!report.count && (
          <p className="admin-empty">
            در این هفته هنوز گزارشی ثبت نشده است. برای شروع، یک روز را انتخاب کنید.
          </p>
        )}
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>روز</th>
                <th>تاریخ</th>
                <th>جمع روز (نفر-ساعت)</th>
                <th>تعداد ردیف</th>
                <th>گزارش</th>
              </tr>
            </thead>
            <tbody>
              {report.days.map((day, index) => (
                <tr key={day.date} className={day.date === today ? "is-today" : ""}>
                  <td>
                    {["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][index]}
                  </td>
                  <td>
                    {formatJalaliDate(day.date)} {day.date === today && "· امروز"}
                  </td>
                  <td>{toPersianDigits(displayHours(day.totalHundredths))}</td>
                  <td>{toPersianDigits(day.count)}</td>
                  <td>
                    {day.date <= today ? (
                      <Link className="subtle-button" href={`/reports/${day.date}`}>
                        {report.period.status === "LOCKED"
                          ? "مشاهده"
                          : day.count
                            ? "مشاهده / ویرایش"
                            : "ثبت فعالیت"}
                      </Link>
                    ) : (
                      <span className="admin-help">روز آینده</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
