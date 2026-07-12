import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { AssignSurveyorForm } from "@/components/projects/assign-surveyor-form";
import { StatusChanger } from "@/components/projects/status-changer";
import { StatusHistory } from "@/components/projects/status-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getClientById } from "@/lib/actions/clients-logic";
import { getStatusLogsForProject } from "@/lib/actions/projects-logic";
import { assertProjectAccess, requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();

  // Mandatory scoping rule: `assertProjectAccess` is the only entry point
  // for reading a single project here — it 404s a surveyor who isn't
  // assigned to this project rather than leaking it.
  const project = await assertProjectAccess(id, user);

  const client = await getClientById(project.clientId);
  const statusLogs = await getStatusLogsForProject(project.id);

  const changedByIds = [...new Set(statusLogs.map((l) => l.changedById))];
  const changedByUsers = changedByIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, changedByIds))
    : [];
  const nameById = new Map(changedByUsers.map((u) => [u.id, u.name]));

  const surveyorRows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.role, "surveyor"));

  const canChangeStatus = user.role === "owner" || project.assignedSurveyorId === user.id;
  const assignedSurveyorName = project.assignedSurveyorId
    ? (nameById.get(project.assignedSurveyorId) ??
      surveyorRows.find((s) => s.id === project.assignedSurveyorId)?.name ??
      "—")
    : "—";

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">{project.title}</h1>
          <p className="text-sm text-muted-foreground">
            {client ? (
              <Link href={`/dashboard/clients/${client.id}`} className="hover:underline">
                {client.name}
              </Link>
            ) : (
              "Klien tidak ditemukan"
            )}
            {" · "}
            {surveyTypeLabel[project.surveyType] ?? project.surveyType}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{statusLabel[project.status] ?? project.status}</Badge>
          {user.role === "owner" ? (
            <Button
              variant="outline"
              render={<Link href={`/dashboard/projects/${project.id}/edit`}>Edit</Link>}
            />
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="peta">Peta</TabsTrigger>
          <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
          {user.role === "owner" ? <TabsTrigger value="keuangan">Keuangan</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Detail proyek</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Lokasi</p>
                <p className="text-sm">{project.locationLabel ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tanggal order</p>
                <p className="text-sm">{project.orderDate.toLocaleDateString("id-ID")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Surveyor</p>
                <p className="text-sm">{assignedSurveyorName}</p>
              </div>
              {project.description ? (
                <div className="sm:col-span-2">
                  <p className="text-xs text-muted-foreground">Deskripsi</p>
                  <p className="text-sm">{project.description}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {user.role === "owner" ? (
            <Card>
              <CardHeader>
                <CardTitle>Assign surveyor</CardTitle>
              </CardHeader>
              <CardContent>
                <AssignSurveyorForm
                  projectId={project.id}
                  currentSurveyorId={project.assignedSurveyorId}
                  surveyors={surveyorRows}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canChangeStatus ? (
                <StatusChanger projectId={project.id} currentStatus={project.status} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Hanya owner atau surveyor yang ditugaskan yang bisa mengubah status.
                </p>
              )}
              <StatusHistory
                logs={statusLogs.map((log) => ({
                  id: log.id,
                  fromStatus: log.fromStatus,
                  toStatus: log.toStatus,
                  changedByName: nameById.get(log.changedById) ?? "—",
                  createdAt: log.createdAt,
                }))}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="peta" className="pt-4">
          <p className="text-sm text-muted-foreground">
            Peta hasil ukur akan tersedia di sini (Fase 4).
          </p>
        </TabsContent>

        <TabsContent value="dokumen" className="pt-4">
          <p className="text-sm text-muted-foreground">
            Arsip dokumen proyek akan tersedia di sini (Fase 5).
          </p>
        </TabsContent>

        {user.role === "owner" ? (
          <TabsContent value="keuangan" className="pt-4">
            <p className="text-sm text-muted-foreground">
              Nilai proyek & status pembayaran akan tersedia di sini (Fase 6).
            </p>
          </TabsContent>
        ) : null}
      </Tabs>
    </main>
  );
}
