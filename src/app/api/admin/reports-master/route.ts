import { masterCollection } from "@/lib/admin-api";
export const GET = (r: Request) => masterCollection(r, "reports");
export const POST = GET;
