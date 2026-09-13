import { requireUser } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Resolve authentication before the page loading boundary can start streaming.
  await requireUser();
  return children;
}
