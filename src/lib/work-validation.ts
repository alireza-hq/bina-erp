import { z } from "zod";
import { idSchema } from "@/lib/validation";
import {
  WORK_LIMITS,
  hoursToHundredths,
  hundredthsToHours,
  isCalendarDate,
  todayInTehran,
} from "@/lib/work-reporting";

export const reportDateSchema = z
  .string()
  .refine(isCalendarDate, "تاریخ معتبر نیست (از سال ۲۰۰۰ تا ۲۰۹۹)");
export const writableDateSchema = reportDateSchema.refine(
  (value) => value <= todayInTehran(),
  "ثبت گزارش برای روزهای آینده مجاز نیست",
);
export const workRowSchema = z.strictObject({
  id: idSchema.optional(),
  projectId: idSchema,
  reportId: idSchema,
  description: z
    .string()
    .trim()
    .max(WORK_LIMITS.descriptionLength, "توضیحات بیش از حد طولانی است")
    .default(""),
  manHours: z
    .string()
    .max(16)
    .refine((value) => {
      const amount = hoursToHundredths(value);
      return amount !== null && amount > 0 && amount <= WORK_LIMITS.entryHundredths;
    }, "نفر-ساعت باید بیشتر از صفر و حداکثر ۲۴، با حداکثر دو رقم اعشار باشد")
    .transform((value) => hundredthsToHours(hoursToHundredths(value)!)),
});
export const dailyEntriesSchema = z
  .strictObject({
    version: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "نسخه گزارش نامعتبر است؛ صفحه را دوباره بارگذاری کنید"),
    entries: z.array(workRowSchema).max(WORK_LIMITS.maxRows, "حداکثر ۵۰ ردیف در روز مجاز است"),
  })
  .superRefine((value, ctx) => {
    const ids = value.entries.flatMap((row) => (row.id ? [row.id] : []));
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "شناسه ردیف تکراری است", path: ["entries"] });
    const total = value.entries.reduce(
      (sum, row) => sum + (hoursToHundredths(row.manHours) ?? 0),
      0,
    );
    if (total > WORK_LIMITS.dailyHundredths)
      ctx.addIssue({
        code: "custom",
        message: "جمع نفر-ساعت یک روز نمی‌تواند بیشتر از ۲۴ باشد",
        path: ["entries"],
      });
  });
export type DailyEntriesInput = z.infer<typeof dailyEntriesSchema>;
