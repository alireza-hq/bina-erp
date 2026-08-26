import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { files, letters, projects, sheets } from "@/db/schema";
import { AppHeader } from "@/components/app-header";
import { ProjectWorkspace } from "@/components/project-workspace";
import { getProjectPermission, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "نامه‌های پروژه" };
export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const permission = await getProjectPermission(user, id);
  if (!permission) redirect("/dashboard");
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id) });
  if (!project) notFound();
  const [allSheets, allLetters, fileRows] = await Promise.all([
    db.select().from(sheets).where(eq(sheets.projectId, id)).orderBy(asc(sheets.position)),
    db
      .select({
        id: letters.id,
        sheetId: letters.sheetId,
        letterDate: letters.letterDate,
        sender: letters.sender,
        recipient: letters.recipient,
        subject: letters.subject,
        description: letters.description,
      })
      .from(letters)
      .where(eq(letters.projectId, id))
      .orderBy(asc(letters.letterDate)),
    db
      .select({
        id: files.id,
        letterId: files.letterId,
        kind: files.kind,
        originalName: files.originalName,
        size: files.size,
      })
      .from(files)
      .innerJoin(letters, eq(files.letterId, letters.id))
      .where(eq(letters.projectId, id)),
  ]);
  const workspaceLetters = allLetters.map((letter) => ({
    ...letter,
    files: fileRows
      .filter((file) => file.letterId === letter.id)
      .map((file) => ({
        id: file.id,
        kind: file.kind,
        originalName: file.originalName,
        size: file.size,
      })),
  }));
  return (
    <div className="app-frame">
      <AppHeader user={user} />
      <main className="content wide-content">
        <ProjectWorkspace
          project={{ id: project.id, name: project.name, code: project.code }}
          sheets={allSheets.map((sheet) => ({
            id: sheet.id,
            name: sheet.name,
            position: sheet.position,
          }))}
          letters={workspaceLetters}
          canWrite={permission === "write"}
        />
      </main>
    </div>
  );
}
