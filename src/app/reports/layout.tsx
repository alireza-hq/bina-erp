import { AuthenticatedHeader } from "@/components/authenticated-header";
import { requireUser } from "@/lib/auth";
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="app-frame">
      <AuthenticatedHeader user={user} />
      <main className="content system-content">{children}</main>
    </div>
  );
}
