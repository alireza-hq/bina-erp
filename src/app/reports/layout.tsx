import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth";
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="app-frame">
      <AppHeader user={{ displayName: user.displayName, role: user.role }} />
      <main className="content system-content">{children}</main>
    </div>
  );
}
