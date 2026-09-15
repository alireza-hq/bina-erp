import { and, eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { users, departments } from "@/db/schema";
import { profileSchema } from "@/lib/validation";
import { WorkEntryError } from "@/lib/work-entries";
import { auditData, recordAudit } from "@/lib/audit";
export async function onboardingDepartments() {
  return db
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .innerJoin(users, eq(departments.managerUserId, users.id))
    .where(and(eq(departments.isActive, true), eq(users.isActive, true)))
    .orderBy(asc(departments.name));
}
export async function completeProfile(userId: string, input: unknown) {
  const data = profileSchema.parse(input);
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("no key update");
    if (!user?.isActive) throw new WorkEntryError("نشست معتبر نیست", 401);
    if (user.profileCompletedAt)
      throw new WorkEntryError(
        "مشخصات قبلاً تکمیل شده؛ برای تغییر با مدیر سامانه تماس بگیرید",
        409,
      );
    const [department] = await tx
      .select()
      .from(departments)
      .where(eq(departments.id, data.departmentId))
      .for("share");
    if (!department?.isActive || !department.managerUserId)
      throw new WorkEntryError("واحد فعال دارای مدیر انتخاب کنید", 409);
    const [manager] = await tx
      .select()
      .from(users)
      .where(eq(users.id, department.managerUserId))
      .for("share");
    if (!manager?.isActive) throw new WorkEntryError("مدیر واحد فعال نیست", 409);
    const [updated] = await tx
      .update(users)
      .set({ ...data, profileCompletedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    await recordAudit(
      tx,
      userId,
      "PROFILE_COMPLETED",
      "USER",
      userId,
      auditData("USER", user),
      auditData("USER", updated),
    );
  });
}
