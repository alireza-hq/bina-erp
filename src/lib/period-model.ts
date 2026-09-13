import { z } from "zod";
import { isCalendarDate, weekStart } from "@/lib/work-reporting";
export const periodWeekSchema = z
  .string()
  .refine(
    (value) => isCalendarDate(value) && weekStart(value) === value,
    "شروع دوره باید تاریخ معتبر روز شنبه باشد",
  );
export const LOCKED_MESSAGE = "این هفته توسط مدیریت بسته شده و امکان ویرایش گزارش‌ها وجود ندارد.";
export class PeriodError extends Error {
  constructor(
    message: string,
    readonly status = 423,
  ) {
    super(message);
  }
}
