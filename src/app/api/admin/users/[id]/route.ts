import { updateUser } from "@/lib/admin-api";
export async function PATCH(request: Request, context: RouteContext<"/api/admin/users/[id]">) {
  return updateUser(request, (await context.params).id);
}
