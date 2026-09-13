import { ownDayApi } from "@/lib/work-api";
export async function GET(request: Request, context: RouteContext<"/api/work-entries/[date]">) {
  return ownDayApi(request, (await context.params).date);
}
export async function PUT(request: Request, context: RouteContext<"/api/work-entries/[date]">) {
  return ownDayApi(request, (await context.params).date);
}
