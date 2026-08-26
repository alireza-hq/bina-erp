import { z } from "zod";
import { toLatinDigits } from "@/lib/persian";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "نام کاربری را وارد کنید").max(128),
  password: z.string().min(1, "رمز عبور را وارد کنید").max(512),
});
export const projectSchema = z.object({
  name: z.string().trim().min(2, "نام پروژه کوتاه است").max(120),
  code: z
    .string()
    .trim()
    .min(1, "کد پروژه را وارد کنید")
    .max(40)
    .regex(/^[A-Za-z0-9۰-۹_-]+$/, "کد فقط می‌تواند شامل حروف انگلیسی، عدد، خط تیره و زیرخط باشد")
    .transform(toLatinDigits),
});
export const sheetSchema = z.object({
  name: z.string().trim().min(1, "نام شیت را وارد کنید").max(80),
});
export const permissionSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  permission: z.enum(["none", "read", "write"]),
});
export const userAdminSchema = z
  .object({
    role: z.enum(["admin", "user"]).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.active !== undefined);
export const letterFieldsSchema = z.object({
  sheetId: z.string().uuid(),
  letterDate: z
    .string()
    .regex(/^[0-9۰-۹]{4}-[0-9۰-۹]{2}-[0-9۰-۹]{2}$/, "تاریخ معتبر نیست")
    .transform(toLatinDigits),
  sender: z.string().trim().min(1, "فرستنده را وارد کنید").max(200),
  recipient: z.string().trim().min(1, "گیرنده را وارد کنید").max(200),
  subject: z.string().trim().min(1, "موضوع را وارد کنید").max(500),
  description: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => value || null),
});
