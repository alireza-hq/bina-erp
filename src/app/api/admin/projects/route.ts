import { masterCollection } from "@/lib/admin-api";
export async function GET(request: Request) {
  return masterCollection(request, "projects");
}
export async function POST(request: Request) {
  return masterCollection(request, "projects");
}
