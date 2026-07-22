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
import { db } from "@/lib/db";
import { clients, projects, users } from "@/lib/db/schema";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { rbacFilter } from "@/lib/rbac/filter";

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
  const ctx = await getRbacContext();

  // Mandatory scoping rule: `rbacFilter(ctx, "project.read")` is the only
  // entry point for reading `projects` here — surveyors get only their
  // assigned rows back already (scope `assigned`), and filters below are then
  // applied server-side (RSC) on top of that pre-scoped set, never widening
  // it. Kolom finance sengaja TIDAK di-SELECT di daftar ini.
  const scopedProjects = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      surveyType: projects.surveyType,
      clientId: projects.clientId,
      assignedSurveyorId: projects.assignedSurveyorId,
      orderDate: projects.orderDate,
    })
    .from(projects)
    .where(rbacFilter(ctx, "project.read"));
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
          ctx.user.role === "surveyor"
            ? "Proyek yang ditugaskan kepada Anda."
            : "Semua proyek studio."
        }
        action={
          can(ctx, "project.create") ? (
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
                : can(ctx, "project.create")
                  ? "Buat proyek pertama untuk mulai melacak pekerjaan survey."
                  : "Belum ada proyek yang ditugaskan kepada Anda."
            }
            action={
              can(ctx, "project.create") ? (
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
