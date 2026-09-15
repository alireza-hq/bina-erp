import type { ReportingPeriod } from "@/lib/reporting-periods";
export function PeriodControl({ initial }: { initial: ReportingPeriod }) {
  return (
    <p className="period-banner" role="status">
      {initial.status === "OPEN"
        ? "هفته جاری؛ ویرایش مطابق وضعیت تأیید"
        : "خارج از هفته جاری؛ فقط خواندنی برای کارکنان"}
    </p>
  );
}
