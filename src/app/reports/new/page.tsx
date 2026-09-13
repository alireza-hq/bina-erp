import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { todayInTehran } from "@/lib/work-reporting";
export default async function NewReportPage() {
  await requireUser();
  redirect(`/reports/${todayInTehran()}`);
}
