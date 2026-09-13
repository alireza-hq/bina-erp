import { periodApi } from "@/lib/period-api";
export async function POST(
  request: Request,
  context: RouteContext<"/api/admin/reporting-periods/[week]/lock">,
) {
  return periodApi(request, (await context.params).week, "lock");
}
