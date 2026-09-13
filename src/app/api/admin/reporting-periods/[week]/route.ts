import { periodApi } from "@/lib/period-api";
export async function GET(
  request: Request,
  context: RouteContext<"/api/admin/reporting-periods/[week]">,
) {
  return periodApi(request, (await context.params).week);
}
