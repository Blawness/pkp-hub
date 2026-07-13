import { FolderKanbanIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArchiveClientButton } from "@/components/clients/archive-client-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getClientById } from "@/lib/actions/clients-logic";
import { listProjectsForUser, requireAdmin } from "@/lib/auth-guards";
import { clientTypeLabel, statusLabel } from "@/lib/labels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Defense in depth: this route is already admin-gated by `layout.tsx`,
  // but `generateMetadata` runs independently, so re-check here rather than
  // rely purely on rendering order before touching `getClientById`.
  await requireAdmin();
  const client = await getClientById(id);
  return { title: client?.name ?? "Klien" };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAdmin();

  const client = await getClientById(id);
  if (!client) notFound();

  // Mandatory scoping rule: never query `projects` directly — go through
  // `listProjectsForUser`, then filter to this client in-memory. As admin,
  // `user` sees every project, so this is equivalent to (but never bypasses)
  // the shared scoping helper.
  const allProjects = await listProjectsForUser(user);
  const clientProjects = allProjects.filter((p) => p.clientId === client.id);

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
          <ButtonLink variant="outline" href={`/dashboard/clients/${client.id}/edit`}>
            Edit
          </ButtonLink>
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
                <ButtonLink size="sm" href="/dashboard/projects/new">
                  Buat proyek
                </ButtonLink>
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
