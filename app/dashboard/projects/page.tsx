import { eq } from "drizzle-orm";
import { FolderKanbanIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { ActiveFilters } from "@/components/projects/active-filters";
import { ProjectFilters } from "@/components/projects/project-filters";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { projectsColumns } from "@/components/projects/projects-columns";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { listClients } from "@/lib/actions/clients-logic";
import { listProjectsForUser, requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, users } from "@/lib/db/schema";

export const metadata = { title: "Proyek" };

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    clientId?: string;
    surveyorId?: string;
    surveyType?: string;
  }>;
}) {
  const filters = await searchParams;
  const user = await requireStaff();

  // Mandatory scoping rule: `listProjectsForUser` is the only entry point
  // for reading `projects` here — surveyors get only their assigned rows
  // back already, and filters below are then applied server-side (RSC) on
  // top of that pre-scoped set, never widening it.
  const scopedProjects = await listProjectsForUser(user);
  const filtered = scopedProjects.filter((p) => {
    if (filters.status && p.status !== filters.status) return false;
    if (filters.clientId && p.clientId !== filters.clientId) return false;
    if (filters.surveyorId && p.assignedSurveyorId !== filters.surveyorId) return false;
    if (filters.surveyType && p.surveyType !== filters.surveyType) return false;
    return true;
  });

  const [clientRows, surveyorRows, activeClientRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "surveyor")),
    listClients(),
  ]);
  const activeClients = activeClientRows.map((c) => ({ id: c.id, name: c.name }));
  const clientMap = new Map(clientRows.map((c) => [c.id, c.name]));
  const surveyorMap = new Map(surveyorRows.map((s) => [s.id, s.name]));

  const rows = filtered.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    surveyType: p.surveyType,
    clientName: clientMap.get(p.clientId) ?? "—",
    surveyorName: p.assignedSurveyorId ? (surveyorMap.get(p.assignedSurveyorId) ?? "—") : "—",
    orderDate: p.orderDate,
  }));

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Proyek"
        description={
          user.role === "surveyor" ? "Proyek yang ditugaskan kepada Anda." : "Semua proyek studio."
        }
        action={
          user.role === "admin" ? (
            <ProjectFormDialog clients={activeClients} surveyors={surveyorRows} />
          ) : undefined
        }
      />

      <DataTable
        columns={projectsColumns}
        data={rows}
        searchable
        searchPlaceholder="Cari proyek atau klien…"
        rowHrefBase="/dashboard/projects"
        toolbar={
          <>
            <ProjectFilters clients={clientRows} surveyors={surveyorRows} />
            <ActiveFilters clients={clientRows} surveyors={surveyorRows} />
          </>
        }
        emptyMessage={
          <EmptyState
            icon={FolderKanbanIcon}
            title={
              filters.status || filters.clientId || filters.surveyorId || filters.surveyType
                ? "Tidak ada proyek yang cocok dengan filter"
                : "Belum ada proyek"
            }
            description={
              filters.status || filters.clientId || filters.surveyorId || filters.surveyType
                ? "Coba ubah atau hapus filter yang aktif."
                : user.role === "admin"
                  ? "Buat proyek pertama untuk mulai melacak pekerjaan survey."
                  : "Belum ada proyek yang ditugaskan kepada Anda."
            }
            action={
              user.role === "admin" ? (
                <ProjectFormDialog
                  clients={activeClients}
                  surveyors={surveyorRows}
                  trigger={<Button size="sm">Proyek baru</Button>}
                />
              ) : undefined
            }
          />
        }
      />
    </main>
  );
}
