import { z } from "zod";
import { APP_ROLES } from "@/lib/roles";

export const idSchema = z.string().uuid("شناسه نامعتبر است");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const name = z.string().trim().min(1, "نام الزامی است").max(160);
const code = z.string().trim().min(1, "کد الزامی است").max(80);

export const loginSchema = z.strictObject({
  username: z.string().trim().min(1, "نام کاربری را وارد کنید").max(128),
  password: z.string().min(1, "رمز عبور را وارد کنید").max(512),
});
export const userAdminSchema = z
  .strictObject({
    role: z.enum(APP_ROLES).optional(),
    isActive: z.boolean().optional(),
    departmentId: idSchema.nullable().optional(),
    displayName: z.string().trim().min(2).max(160).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "تغییری ارسال نشده است");

export const profileSchema = z.strictObject({
  displayName: z.string().trim().min(2, "نام و نام خانوادگی الزامی است").max(160),
  departmentId: idSchema,
});
export const departmentSchema = z.strictObject({
  managerUserId: idSchema.nullable().optional(),
  name,
  code: optionalText(80).optional(),
  isActive: z.boolean().default(true),
});
export const projectSchema = z.strictObject({
  managerUserId: idSchema.nullable().optional(),
  code,
  name,
  description: optionalText(2000).optional(),
  isActive: z.boolean().default(true),
});
export const reportSchema = z.strictObject({
  name,
  description: optionalText(2000).optional(),
  isActive: z.boolean().default(true),
});
export const reportUpdateSchema = reportSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "تغییری ارسال نشده است");
export const departmentUpdateSchema = departmentSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "تغییری ارسال نشده است");
export const projectUpdateSchema = projectSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "تغییری ارسال نشده است");
