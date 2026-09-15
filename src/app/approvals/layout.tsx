import { requireUser } from "@/lib/auth";
import { AuthenticatedHeader } from "@/components/authenticated-header";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AuthenticatedHeader user={user} />
      <main className="content system-content">{children}</main>
    </>
  );
}
