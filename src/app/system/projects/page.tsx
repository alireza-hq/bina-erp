import { asc } from "drizzle-orm";
import { db } from "@/db";
import { projects, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { MasterDataManager } from "@/components/master-data-manager";
export const metadata = { title: "پروژه‌ها" };
export default async function Page() {
  await requireRole("IT_ADMIN");
  const rows = await db.select().from(projects).orderBy(asc(projects.name));
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
        <h1>پروژه‌ها</h1>
      </header>
      <MasterDataManager kind="projects" initialRows={rows} managers={managers} />
    </>
  );
}
