import { eq } from "drizzle-orm";
import { ProjectForm } from "@/components/projects/project-form";
import { requireOwner } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, users } from "@/lib/db/schema";

export default async function NewProjectPage() {
  await requireOwner();

  const [clientRows, surveyorRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "surveyor")),
  ]);

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Proyek baru</h1>
        <p className="text-sm text-muted-foreground">
          Buat proyek survey baru untuk seorang klien.
        </p>
      </div>
      <ProjectForm clients={clientRows} surveyors={surveyorRows} />
    </main>
  );
}
