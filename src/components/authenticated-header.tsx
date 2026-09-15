import { hasManagementScope } from "@/lib/approvals";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, type AppUser } from "@/db/schema";
import { AppHeader } from "@/components/app-header";

export async function AuthenticatedHeader({ user }: { user: AppUser }) {
  const department = user.departmentId
    ? await db.query.departments.findFirst({ where: eq(departments.id, user.departmentId) })
    : null;
  const isManager = await hasManagementScope(user.id);
  return (
    <AppHeader
      user={{
        isManager,
        displayName: user.displayName,
        role: user.role,
        departmentName: department?.name,
      }}
    />
  );
}
