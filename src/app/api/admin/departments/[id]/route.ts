import { masterItem } from "@/lib/admin-api";
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/departments/[id]">,
) {
  const { id } = await context.params;
  return masterItem(request, "departments", id);
}
