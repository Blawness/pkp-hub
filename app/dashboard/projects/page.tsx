import { eq } from "drizzle-orm";
import Link from "next/link";
import { ProjectFilters } from "@/components/projects/project-filters";
import { projectsColumns } from "@/components/projects/projects-columns";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { listProjectsForUser, requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, users } from "@/lib/db/schema";

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

  const [clientRows, surveyorRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "surveyor")),
  ]);
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
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">Proyek</h1>
          <p className="text-sm text-muted-foreground">
            {user.role === "surveyor"
              ? "Proyek yang ditugaskan kepada Anda."
              : "Semua proyek studio."}
          </p>
        </div>
        {user.role === "owner" ? (
          <Button render={<Link href="/dashboard/projects/new">Proyek baru</Link>} />
        ) : null}
      </div>

      <ProjectFilters clients={clientRows} surveyors={surveyorRows} />

      <DataTable columns={projectsColumns} data={rows} emptyMessage="Tidak ada proyek." />
    </main>
  );
}
