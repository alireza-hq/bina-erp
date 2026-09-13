import { AuthenticatedHeader } from "@/components/authenticated-header";
import { requireRole } from "@/lib/auth";
export default async function SystemLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("IT_ADMIN");
  return (
    <div className="app-frame">
      <AuthenticatedHeader user={user} />
      <main className="content system-content">{children}</main>
    </div>
  );
}
