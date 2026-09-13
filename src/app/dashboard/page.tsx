import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppHeader } from "@/components/app-header";
import { ReportExportActions } from "@/components/report-export-actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { getEmployeeDashboard, getBusinessDashboard } from "@/lib/dashboards";
import { reportHref, reportHours } from "@/lib/business-report-query";
import { displayHours, shiftDate } from "@/lib/work-reporting";
import { formatJalaliDate } from "@/lib/jalali";
import { toPersianDigits } from "@/lib/persian";

export const dynamic = "force-dynamic";
export const metadata = { title: "داشبورد" };
const hours = (value: string) => toPersianDigits(reportHours(value));
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{toPersianDigits(value)}</strong>
    </div>
  );
}
function PeriodBadge({ locked }: { locked: boolean }) {
  return (
    <p className={`period-banner ${locked ? "locked" : "open"}`} role="status">
      {locked ? "این دوره قفل شده است؛ گزارش‌ها فقط قابل مشاهده هستند." : "این هفته باز است"}
    </p>
  );
}
async function EmployeeDashboard() {
  const { today, week, todayReport, reportedDays } = await getEmployeeDashboard();
  const locked = week.period.status === "LOCKED";
  return (
    <>
      <p>
        {formatJalaliDate(week.start)} تا {formatJalaliDate(shiftDate(week.start, 6))}
      </p>
      <PeriodBadge locked={locked} />
      <div className="metric-grid">
        <Metric label="این هفته · نفر-ساعت" value={displayHours(week.totalHundredths)} />
        <Metric label="امروز · نفر-ساعت" value={displayHours(todayReport.totalHundredths)} />
        <Metric label="روزهای دارای گزارش" value={reportedDays} />
      </div>
      <div className="admin-actions dashboard-actions">
        <Link className="primary-button" href={`/reports/${today}`}>
          {locked
            ? "مشاهده گزارش امروز"
            : todayReport.count
              ? "ویرایش گزارش امروز"
              : "ثبت گزارش امروز"}
        </Link>
        <Link className="secondary-button" href="/reports">
          مشاهده گزارش‌های من
        </Link>
      </div>
      <section className="admin-surface">
        <h2>روزهای این هفته</h2>
        {!week.count && <p className="admin-empty">برای این هفته هنوز گزارشی ثبت نشده است.</p>}
        <div className="week-days">
          {week.days.map((day, index) => (
            <article key={day.date} className={`week-day ${day.date === today ? "is-today" : ""}`}>
              <strong>
                {["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"][index]}{" "}
                {day.date === today && "· امروز"}
              </strong>
              <span>{formatJalaliDate(day.date)}</span>
              <b>
                {day.count ? `${toPersianDigits(displayHours(day.totalHundredths))} نفر-ساعت` : "—"}
              </b>
              <small>{locked ? "فقط مشاهده" : day.count ? "گزارش ثبت شده" : "بدون گزارش"}</small>
              {day.date <= today ? (
                <Link className="subtle-button" href={`/reports/${day.date}`}>
                  {locked ? "مشاهده" : day.count ? "ویرایش" : "ثبت گزارش"}
                </Link>
              ) : (
                <small>روز آینده</small>
              )}
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
async function BusinessDashboard() {
  const {
    query,
    report,
    departments: departmentReport,
    counts,
    missingPeople,
    period,
  } = await getBusinessDashboard();
  return (
    <>
      <p>
        هفته جاری: {formatJalaliDate(query.from)} تا {formatJalaliDate(query.to)}
      </p>
      <PeriodBadge locked={period.status === "LOCKED"} />
      <div className="metric-grid">
        <Metric label="جمع نفر-ساعت" value={hours(report.totalHours)} />
        <Metric label="ردیف‌های فعالیت" value={report.entryCount} />
        <Metric label="افراد دارای گزارش · همه نقش‌ها" value={counts.reporters} />
        <Metric label="کارکنان فعال بدون گزارش" value={counts.missing} />
        <Metric label="پروژه‌های فعال دارای گزارش" value={counts.activeProjects} />
      </div>
      <div className="dashboard-actions">
        <Link className="primary-button" href={reportHref(query)}>
          گزارش‌های هفته
        </Link>
        <ReportExportActions query={query} />
      </div>
      <div className="dashboard-columns">
        {(
          [
            ["project", "نفر-ساعت پروژه‌ها", report],
            ["department", "نفر-ساعت واحدهای فعلی", departmentReport],
          ] as const
        ).map(([dimension, label, result]) => (
          <section className="admin-surface" key={dimension}>
            <h2>{label}</h2>
            {!result.groupCount ? (
              <p className="admin-empty">برای این هفته هنوز گزارشی ثبت نشده است.</p>
            ) : (
              <ul className="breakdown-list">
                {result.groups.map((group) => (
                  <li key={group.primaryKey}>
                    <bdi>{group.primaryLabel}</bdi>
                    <strong className="numeric">{hours(group.totalHours)}</strong>
                  </li>
                ))}
              </ul>
            )}
            <Link className="subtle-button" href={reportHref(query, { groupBy: dimension })}>
              مشاهده همه گروه‌ها ({toPersianDigits(result.groupCount)})
            </Link>
            {result.groupCount > 50 && (
              <p className="admin-help">۵۰ گروه اول به ترتیب نام نمایش داده شده است.</p>
            )}
          </section>
        ))}
      </div>
      <section className="admin-surface">
        <h2>کارکنان بدون گزارش ثبت‌شده</h2>
        <p className="admin-help">
          فقط حساب‌های فعال با نقش کارمند، با یا بدون واحد، که در این هفته هیچ فعالیتی ثبت
          نکرده‌اند. این فهرست نشان‌دهنده غیبت نیست.
        </p>
        {!counts.missing ? (
          <p className="admin-empty">کارمند فعالی بدون گزارش در این هفته وجود ندارد.</p>
        ) : (
          <ul className="breakdown-list">
            {missingPeople.map((person) => (
              <li key={person.id}>
                <span>
                  {person.name}{" "}
                  <small>
                    <bdi>{person.username}</bdi>
                  </small>
                </span>
                <Link className="subtle-button" href={reportHref(query, { employeeId: person.id })}>
                  بررسی گزارش
                </Link>
              </li>
            ))}
          </ul>
        )}
        {counts.missing > 20 && (
          <p className="admin-help">
            ۲۰ نفر اول از {toPersianDigits(counts.missing)} نفر، به ترتیب نام.
          </p>
        )}
        <p className="admin-help">
          واحدها بر اساس واحد فعلی کارمند هستند؛ قفل دوره، واحد سازمانی را ثابت نمی‌کند.
        </p>
      </section>
    </>
  );
}
export default async function DashboardPage() {
  const user = await requireUser();
  const department = user.departmentId
    ? await db.query.departments.findFirst({ where: eq(departments.id, user.departmentId) })
    : null;
  return (
    <div className="app-frame">
      <AppHeader
        user={{ displayName: user.displayName, role: user.role, departmentName: department?.name }}
      />
      <main className="content" id="main-content">
        <header className="page-title">
          <div>
            <h1>داشبورد</h1>
            <p>خوش آمدید، {user.displayName}</p>
          </div>
        </header>
        {user.role === "EMPLOYEE" ? <EmployeeDashboard /> : <BusinessDashboard />}
      </main>
    </div>
  );
}
