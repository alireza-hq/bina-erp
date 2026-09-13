import { businessReportApi } from "@/lib/business-report-api";
export function GET(request: Request) {
  return businessReportApi(request, true);
}
