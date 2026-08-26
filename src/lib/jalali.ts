import { isValidJalaaliDate, jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";
import { toLatinDigits, toPersianDigits } from "@/lib/persian";

export type JalaliParts = { year: number; month: number; day: number };

export function gregorianIsoToJalali(value: string): JalaliParts | null {
  const match = toLatinDigits(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const result = toJalaali(Number(match[1]), Number(match[2]), Number(match[3]));
  return { year: result.jy, month: result.jm, day: result.jd };
}

export function jalaliToGregorianIso(year: number, month: number, day: number) {
  if (!isValidJalaaliDate(year, month, day)) return null;
  const result = toGregorian(year, month, day);
  return `${result.gy.toString().padStart(4, "0")}-${result.gm.toString().padStart(2, "0")}-${result.gd.toString().padStart(2, "0")}`;
}

export function formatJalaliDate(value: string) {
  const parts = gregorianIsoToJalali(value);
  if (!parts) return toPersianDigits(value);
  return toPersianDigits(
    `${parts.year}/${parts.month.toString().padStart(2, "0")}/${parts.day.toString().padStart(2, "0")}`,
  );
}

export function jalaliDaysInMonth(year: number, month: number) {
  return jalaaliMonthLength(year, month);
}
