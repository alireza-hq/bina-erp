import { z } from "zod";
export const WORK_STATUSES = [
  "PENDING_DEPARTMENT_APPROVAL",
  "PENDING_PROJECT_APPROVAL",
  "APPROVED",
  "REJECTED",
] as const;
export const statusLabels = {
  PENDING_DEPARTMENT_APPROVAL: "در انتظار تأیید مدیر واحد",
  PENDING_PROJECT_APPROVAL: "در انتظار تأیید مدیر پروژه",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
};
export const decisionSchema = z
  .strictObject({
    stage: z.enum(["DEPARTMENT", "PROJECT"]),
    decision: z.enum(["APPROVED", "REJECTED"]),
    rejectionReason: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, c) => {
    if (v.decision === "REJECTED" && !v.rejectionReason)
      c.addIssue({ code: "custom", message: "دلیل رد الزامی است" });
    if (v.decision === "APPROVED" && v.rejectionReason)
      c.addIssue({ code: "custom", message: "برای تأیید دلیل رد ارسال نکنید" });
  });
export const approvalQuerySchema = z.strictObject({
  view: z.enum(["pending", "history"]).default("pending"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
