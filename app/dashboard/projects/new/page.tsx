import { eq } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { ProjectForm } from "@/components/projects/project-form";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listClients } from "@/lib/actions/clients-logic";
import { requireAdmin } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const metadata = { title: "Proyek baru" };

export default async function NewProjectPage() {
  await requireAdmin();

  // `listClients()` excludes archived (soft-deleted) clients by default —
  // there's no existing project here whose client we'd otherwise need to
  // keep visible, unlike the edit page.
  const [clientRows, surveyorRows] = await Promise.all([
    listClients(),
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
      {clientRows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Belum ada klien"
          description="Proyek harus dimiliki oleh seorang klien. Buat klien terlebih dahulu sebelum membuat proyek."
          action={
            <ButtonLink size="sm" href="/dashboard/clients/new">
              Buat klien
            </ButtonLink>
          }
        />
      ) : (
        <ProjectForm clients={clientRows} surveyors={surveyorRows} />
      )}
    </main>
  );
}
