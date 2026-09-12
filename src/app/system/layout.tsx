import { AppHeader } from "@/components/app-header";
import { requireRole } from "@/lib/auth";
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("IT_ADMIN");
  return (
    <div className="app-frame">
      <AppHeader user={{ displayName: user.displayName, role: user.role }} />
      <main className="content system-content">{children}</main>
    </div>
  );
}
