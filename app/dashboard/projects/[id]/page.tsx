import { eq, inArray } from "drizzle-orm";
import { FileIcon } from "lucide-react";
import Link from "next/link";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentsTable } from "@/components/documents/documents-table";
import { PetaTab } from "@/components/map/peta-tab";
import { AssignSurveyorForm } from "@/components/projects/assign-surveyor-form";
import { PaymentForm } from "@/components/projects/payment-form";
import { StatusChanger } from "@/components/projects/status-changer";
import { StatusHistory } from "@/components/projects/status-history";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getClientById } from "@/lib/actions/clients-logic";
import { listDocumentsForProject } from "@/lib/actions/documents-logic";
import type { PaymentStatus } from "@/lib/actions/finance-schemas";
import { listMapLayersForProject } from "@/lib/actions/maps-logic";
import {
  getAllowedNextStatuses,
  getProjectDetailForUser,
  getStatusLogsForProject,
  type ProjectStatus,
} from "@/lib/actions/projects-logic";
import { requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatIDR } from "@/lib/format";
import { paymentStatusLabel, statusLabel, surveyTypeLabel } from "@/lib/labels";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Defense in depth: re-run the same scoped lookup `generateMetadata` will
  // otherwise skip if it ran before the page body — `getProjectDetailForUser`
  // 404s a surveyor who isn't assigned rather than leaking the title.
  const user = await requireStaff();
  const project = await getProjectDetailForUser(user, id);
  return { title: project.title };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();

  // Mandatory scoping rule: `getProjectDetailForUser` (which internally
  // calls `assertProjectAccess`) is the only entry point for reading a
  // single project here — it 404s a surveyor who isn't assigned to this
  // project rather than leaking it, AND it strips `projectValue` /
  // `paymentStatus` / `paymentNotes` from the returned object entirely for
  // any non-owner caller (Phase 6+7 review fix — CRITICAL). `project` below
  // never contains those keys unless `user.role === "owner"`.
  const project = await getProjectDetailForUser(user, id);

  const client = await getClientById(project.clientId);
  const statusLogs = await getStatusLogsForProject(project.id);
  const projectDocuments = await listDocumentsForProject(user, project.id);
  const mapLayerRows = await listMapLayersForProject(user, project.id);

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

  const uploaderIds = [...new Set(projectDocuments.map((d) => d.uploadedById))];
  const uploaderUsers = uploaderIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, uploaderIds))
    : [];
  const uploaderNameById = new Map(uploaderUsers.map((u) => [u.id, u.name]));

  const documentRows = projectDocuments.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    fileUrl: d.fileUrl,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    sharedWithClient: d.sharedWithClient,
    uploaderName: uploaderNameById.get(d.uploadedById) ?? "—",
    createdAt: d.createdAt,
  }));

  const canChangeStatus = user.role === "owner" || project.assignedSurveyorId === user.id;
  const allowedNextStatuses = canChangeStatus
    ? getAllowedNextStatuses(
        project.status as ProjectStatus,
        user.role === "owner" ? "owner" : "surveyor",
      )
    : [];
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
            <ButtonLink variant="outline" href={`/dashboard/projects/${project.id}/edit`}>
              Edit
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="peta">Peta</TabsTrigger>
          <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
          {"projectValue" in project ? <TabsTrigger value="keuangan">Keuangan</TabsTrigger> : null}
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
                <StatusChanger
                  projectId={project.id}
                  currentStatus={project.status}
                  allowedNextStatuses={allowedNextStatuses}
                />
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
          <PetaTab
            projectId={project.id}
            initialLayers={mapLayerRows.map((l) => ({
              id: l.id,
              name: l.name,
              // biome-ignore lint/suspicious/noExplicitAny: jsonb column, shape validated at write time by maps-schemas.ts.
              geojson: l.geojson as any,
              areaSqm: l.areaSqm,
              source: l.source,
            }))}
          />
        </TabsContent>

        <TabsContent value="dokumen" className="flex flex-col gap-4 pt-4">
          <DocumentUpload projectId={project.id} />
          <DocumentsTable
            rows={documentRows}
            isOwner={user.role === "owner"}
            emptyMessage={
              <EmptyState
                icon={FileIcon}
                title="Belum ada dokumen"
                description="Unggah laporan, berita acara, atau foto lapangan untuk proyek ini."
              />
            }
          />
        </TabsContent>

        {/* Both the trigger above and this panel only exist in the tree when
            `"projectValue" in project` — which is only true for an owner's
            payload (see `getProjectDetailForUser`). A surveyor's `project`
            never has this key, so this branch is unreachable for them and
            no finance data is ever part of their RSC payload. */}
        {"projectValue" in project ? (
          <TabsContent value="keuangan" className="flex flex-col gap-6 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Status saat ini</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Nilai proyek</p>
                  <p className="text-sm">{formatIDR(project.projectValue)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status pembayaran</p>
                  <p className="text-sm">
                    {paymentStatusLabel[project.paymentStatus] ?? project.paymentStatus}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ubah nilai & status pembayaran</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentForm
                  projectId={project.id}
                  projectValue={project.projectValue}
                  paymentStatus={project.paymentStatus as PaymentStatus}
                  paymentNotes={project.paymentNotes}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </main>
  );
}
