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
    employeeCode: optionalText(80).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "تغییری ارسال نشده است");

export const departmentSchema = z.strictObject({
  name,
  code: optionalText(80).optional(),
  isActive: z.boolean().default(true),
});
export const projectSchema = z.strictObject({
  code,
  name,
  description: optionalText(2000).optional(),
  isActive: z.boolean().default(true),
});
export const projectFileSchema = projectSchema;
export const departmentUpdateSchema = departmentSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "تغییری ارسال نشده است");
export const projectUpdateSchema = projectSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, "تغییری ارسال نشده است");
