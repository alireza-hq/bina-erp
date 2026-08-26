import { z } from "zod";

export const MAX_FILE_SIZE = 15 * 1024 * 1024;
const allowed = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);
export const clientFileSchema = z
  .custom<File>(
    (value) => typeof File !== "undefined" && value instanceof File && value.size > 0,
    "فایل را انتخاب کنید",
  )
  .refine((file) => file.size <= MAX_FILE_SIZE, "حجم فایل باید کمتر از ۱۵ مگابایت باشد")
  .refine((file) => allowed.has(file.type), "نوع فایل مجاز نیست");
export async function uploadValue(value: FormDataEntryValue | null, required = false) {
  if (!(value instanceof File) || value.size === 0) {
    if (required) throw new Error("فایل نامه را انتخاب کنید");
    return null;
  }
  if (value.size > MAX_FILE_SIZE) throw new Error("حجم فایل باید کمتر از ۱۵ مگابایت باشد");
  if (!allowed.has(value.type)) throw new Error("نوع فایل مجاز نیست");
  return {
    originalName: value.name.replace(/[\r\n"]/g, "_"),
    mimeType: value.type,
    size: value.size,
    data: Buffer.from(await value.arrayBuffer()),
  };
}
