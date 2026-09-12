import { projectFileItem } from "@/lib/admin-api";
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/admin/projects/[id]/files/[fileId]">,
) {
  const { id, fileId } = await context.params;
  return projectFileItem(request, id, fileId);
}
