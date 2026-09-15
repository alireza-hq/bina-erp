import { masterItem } from "@/lib/admin-api";
export async function PATCH(r: Request, { params }: { params: Promise<{ id: string }> }) {
  return masterItem(r, "reports", (await params).id);
}
