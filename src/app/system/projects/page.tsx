import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { MasterDataManager } from "@/components/master-data-manager";
export const metadata = { title: "پروژه‌ها" };
export default async function ProjectsPage() {
  await requireRole("IT_ADMIN");
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      code: projects.code,
      description: projects.description,
      isActive: projects.isActive,
    })
    .from(projects)
    .orderBy(asc(projects.name));
  return (
    <>
      <header className="page-title">
        <div>
          <h1>پروژه‌ها</h1>
          <p>اطلاعات پایه پروژه و مقادیر فایل‌های آن</p>
        </div>
      </header>
      <MasterDataManager kind="projects" initialRows={rows} />
    </>
  );
}
