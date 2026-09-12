import { masterCollection } from "@/lib/admin-api";
export async function GET(request: Request) {
  return masterCollection(request, "departments");
}
export async function POST(request: Request) {
  return masterCollection(request, "departments");
}
