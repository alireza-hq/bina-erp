import { asc } from "drizzle-orm";
import { db } from "@/db";
import { reportTypes, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { MasterDataManager } from "@/components/master-data-manager";
export const metadata = { title: "گزارش‌ها" };
export default async function Page() {
  await requireRole("IT_ADMIN");
  const rows = await db.select().from(reportTypes).orderBy(asc(reportTypes.name));
  const managers = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      isActive: users.isActive,
    })
    .from(users)
    .orderBy(asc(users.displayName));
  return (
    <>
      <header className="page-title">
        <h1>گزارش‌ها</h1>
      </header>
      <MasterDataManager kind="reports" initialRows={rows} managers={managers} />
    </>
  );
}
