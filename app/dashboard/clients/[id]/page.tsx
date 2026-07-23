import { eq } from "drizzle-orm";
import { FolderKanbanIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveClientButton } from "@/components/clients/archive-client-button";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { InviteClientButton } from "@/components/clients/invite-client-button";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getClientById } from "@/lib/actions/clients-logic";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { clientTypeLabel, statusLabel } from "@/lib/labels";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { rbacFilter } from "@/lib/rbac/filter";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Defense in depth: this route is already gated by `layout.tsx`
  // (`client.read`), but `generateMetadata` runs independently, so re-check
  // here rather than rely purely on rendering order before `getClientById`.
  const ctx = await getRbacContext();
  if (!can(ctx, "client.read")) notFound();
  const client = await getClientById(id);
  return { title: client?.name ?? "Klien" };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getRbacContext();
  if (!can(ctx, "client.read")) notFound();

  const client = await getClientById(id);
  if (!client) notFound();

  // Mandatory scoping rule: never query `projects` unscoped — selalu lewat
  // `rbacFilter(ctx, "project.read")`, lalu filter ke klien ini. Sebagai
  // admin ctx melihat semua proyek, jadi ini setara dengan (tapi tak pernah
  // melewati) batas scoping bersama.
  const allProjects = await db.select().from(projects).where(rbacFilter(ctx, "project.read"));
  const clientProjects = allProjects.filter((p) => p.clientId === client.id);

  const surveyorRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, "surveyor"));

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">{client.name}</h1>
          <p className="text-sm text-muted-foreground">
            {clientTypeLabel[client.type]}
            {client.archivedAt ? " · Diarsipkan" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <InviteClientButton
            clientId={client.id}
            email={client.email}
            hasUser={Boolean(client.userId)}
            archived={Boolean(client.archivedAt)}
          />
          <ClientFormDialog
            client={{
              id: client.id,
              name: client.name,
              type: client.type,
              phone: client.phone,
              email: client.email,
              address: client.address,
              notes: client.notes,
            }}
          />
          {!client.archivedAt ? <ArchiveClientButton clientId={client.id} /> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kontak</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Telepon</p>
            <p className="text-sm">{client.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="text-sm">{client.email ?? "—"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground">Alamat</p>
            <p className="text-sm">{client.address ?? "—"}</p>
          </div>
          {client.notes ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Catatan</p>
              <p className="text-sm">{client.notes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proyek ({clientProjects.length})</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {clientProjects.length === 0 ? (
            <EmptyState
              icon={FolderKanbanIcon}
              title="Belum ada proyek"
              description="Klien ini belum punya proyek survey."
              action={
                <ProjectFormDialog
                  clients={[{ id: client.id, name: client.name }]}
                  surveyors={surveyorRows}
                  trigger={<Button size="sm">Buat proyek</Button>}
                />
              }
            />
          ) : (
            clientProjects.map((project) => (
              <Link
                key={project.id}
                href={`/dashboard/projects/${project.id}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-muted"
              >
                <span className="text-sm font-medium">{project.title}</span>
                <Badge variant="secondary">{statusLabel[project.status] ?? project.status}</Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
