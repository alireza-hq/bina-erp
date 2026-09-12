import { masterItem } from "@/lib/admin-api";
export async function PATCH(request: Request, context: RouteContext<"/api/admin/projects/[id]">) {
  const { id } = await context.params;
  return masterItem(request, "projects", id);
}
