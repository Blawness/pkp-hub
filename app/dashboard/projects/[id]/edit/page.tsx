import { eq } from "drizzle-orm";
import { ProjectForm } from "@/components/projects/project-form";
import { assertProjectAccess, requireOwner } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, users } from "@/lib/db/schema";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireOwner();

  // Mandatory scoping rule: always go through `assertProjectAccess`, never a
  // raw `db.select()` on `projects` — even on an owner-only page.
  const project = await assertProjectAccess(id, user);

  const [clientRows, surveyorRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "surveyor")),
  ]);

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Edit proyek</h1>
        <p className="text-sm text-muted-foreground">{project.title}</p>
      </div>
      <ProjectForm project={project} clients={clientRows} surveyors={surveyorRows} />
    </main>
  );
}
