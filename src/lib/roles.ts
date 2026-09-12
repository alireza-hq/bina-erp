export const APP_ROLES = ["EMPLOYEE", "BUSINESS_ADMIN", "IT_ADMIN"] as const;
export type AppRole = (typeof APP_ROLES)[number];
export const roleLabels: Record<AppRole, string> = {
  EMPLOYEE: "کارمند",
  BUSINESS_ADMIN: "مدیر کسب‌وکار",
  IT_ADMIN: "مدیر فناوری اطلاعات",
};
