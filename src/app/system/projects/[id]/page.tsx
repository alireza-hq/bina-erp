import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { projects, projectFiles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { idSchema } from "@/lib/validation";
import { MasterDataManager } from "@/components/master-data-manager";
export const metadata = { title: "فایل‌های پروژه" };
export default async function ProjectPage({ params }: PageProps<"/system/projects/[id]">) {
  await requireRole("IT_ADMIN");
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  if (!project) notFound();
  const rows = await db
    .select({
      id: projectFiles.id,
      name: projectFiles.name,
      code: projectFiles.code,
      description: projectFiles.description,
      isActive: projectFiles.isActive,
    })
    .from(projectFiles)
    .where(eq(projectFiles.projectId, id))
    .orderBy(asc(projectFiles.code));
  return (
    <>
      <Link className="subtle-button" href="/system/projects">
        بازگشت به پروژه‌ها
      </Link>
      <header className="page-title">
        <div>
          <h1>{project.name}</h1>
          <p>
            {project.code} · {project.isActive ? "فعال" : "غیرفعال"}
          </p>
          <p>{project.description}</p>
        </div>
      </header>
      <MasterDataManager
        kind="files"
        projectId={id}
        parentActive={project.isActive}
        initialRows={rows}
      />
    </>
  );
}
