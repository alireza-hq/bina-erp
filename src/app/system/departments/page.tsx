import { asc } from "drizzle-orm";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { MasterDataManager } from "@/components/master-data-manager";
export const metadata = { title: "واحدهای سازمانی" };
export default async function DepartmentsPage() {
  await requireRole("IT_ADMIN");
  const rows = await db
    .select({
      id: departments.id,
      name: departments.name,
      code: departments.code,
      isActive: departments.isActive,
    })
    .from(departments)
    .orderBy(asc(departments.name));
  return (
    <>
      <header className="page-title">
        <div>
          <h1>واحدهای سازمانی</h1>
          <p>تعریف و نگهداری واحدهای سازمان</p>
        </div>
      </header>
      <MasterDataManager kind="departments" initialRows={rows} />
    </>
  );
}
