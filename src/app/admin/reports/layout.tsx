import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth";
import { REPORT_ROLES } from "@/lib/business-report-query";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(...REPORT_ROLES);
  return (
    <div className="app-frame">
      <AppHeader user={user} />
      <main className="content system-content">{children}</main>
    </div>
  );
}
