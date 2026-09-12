import { projectFileCollection } from "@/lib/admin-api";
export async function GET(
  request: Request,
  context: RouteContext<"/api/admin/projects/[id]/files">,
) {
  return projectFileCollection(request, (await context.params).id);
}
export async function POST(
  request: Request,
  context: RouteContext<"/api/admin/projects/[id]/files">,
) {
  return projectFileCollection(request, (await context.params).id);
}
