import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getOwnWorkEntriesForDate,
  getActiveWorkProjects,
  getActiveWorkReports,
} from "@/lib/work-entries";
import { isCalendarDate, todayInTehran } from "@/lib/work-reporting";
import { WorkDayEditor } from "@/components/work-day-editor";
export const metadata = { title: "ثبت گزارش کار" };
export default async function ReportDayPage({ params }: PageProps<"/reports/[date]">) {
  const user = await requireUser();
  const { date } = await params;
  if (!isCalendarDate(date)) notFound();
  const [day, projects, reports] = await Promise.all([
    getOwnWorkEntriesForDate(user.id, date),
    getActiveWorkProjects(),
    getActiveWorkReports(),
  ]);
  return (
    <WorkDayEditor
      key={date}
      initialDay={day}
      projects={projects}
      reports={reports}
      today={todayInTehran()}
    />
  );
}
