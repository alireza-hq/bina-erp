// Shared date/decimal rules. All arithmetic uses integers, never binary fractional hours.
export const WORK_LIMITS = {
  maxRows: 50,
  descriptionLength: 2000,
  entryHundredths: 2400,
  dailyHundredths: 2400,
  warningHundredths: 1200,
  maxBodyBytes: 512 * 1024,
  earliestDate: "2000-01-01",
  latestDate: "2099-12-31",
} as const;

export function normalizeHours(value: string) {
  return value
    .trim()
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, ".");
}
export function hoursToHundredths(value: string): number | null {
  const text = normalizeHours(value);
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export function hundredthsToHours(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
export function displayHours(value: number) {
  return hundredthsToHours(value).replace(/\.?0+$/, "");
}
export function todayInTehran(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function isCalendarDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < WORK_LIMITS.earliestDate ||
    value > WORK_LIMITS.latestDate
  )
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function weekStart(value: string) {
  return shiftDate(value, -((new Date(`${value}T00:00:00Z`).getUTCDay() + 1) % 7));
}
