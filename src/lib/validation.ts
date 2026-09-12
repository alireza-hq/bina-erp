import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "نام کاربری را وارد کنید").max(128),
  password: z.string().min(1, "رمز عبور را وارد کنید").max(512),
});
export const userAdminSchema = z
  .object({
    role: z.enum(["admin", "user"]).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => value.role !== undefined || value.active !== undefined);
