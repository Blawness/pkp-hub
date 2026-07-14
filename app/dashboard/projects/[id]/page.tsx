import { and, eq, inArray, isNull } from "drizzle-orm";
import { FileIcon } from "lucide-react";
import Link from "next/link";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentsTable } from "@/components/documents/documents-table";
import {
  ProjectEquipment,
  type ProjectEquipmentUsageRow,
} from "@/components/equipment/project-equipment";
import { PetaTab } from "@/components/map/peta-tab";
import { PaymentsPanel } from "@/components/payments/payments-panel";
import { AssignSurveyorForm } from "@/components/projects/assign-surveyor-form";
import { PaymentForm } from "@/components/projects/payment-form";
import { PhaseTimeline } from "@/components/projects/phase-timeline";
import { StatusChanger } from "@/components/projects/status-changer";
import { StatusHistory } from "@/components/projects/status-history";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getClientById } from "@/lib/actions/clients-logic";
import { listDocumentsForProject } from "@/lib/actions/documents-logic";
import { listEquipmentForUser, listUsageForProject } from "@/lib/actions/equipment-logic";
import { listMapLayersForProject } from "@/lib/actions/maps-logic";
import { getPaymentSummary, listPaymentsForProject } from "@/lib/actions/payments-logic";
import { getProjectProgress, listPhasesForProject } from "@/lib/actions/phases-logic";
import {
  getAllowedNextStatuses,
  getProjectDetailForUser,
  getStatusLogsForProject,
  type ProjectStatus,
} from "@/lib/actions/projects-logic";
import { requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatDuration, usageDurationMs } from "@/lib/equipment/derive";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";
import { todayString } from "@/lib/phases/derive";
import { downloadUrlFor } from "@/lib/storage";

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
  // any non-admin caller (Phase 6+7 review fix — CRITICAL). `project` below
  // never contains those keys unless `user.role === "admin"`.
  const project = await getProjectDetailForUser(user, id);

  const client = await getClientById(project.clientId);
  const statusLogs = await getStatusLogsForProject(project.id);
  const projectDocuments = await listDocumentsForProject(user, project.id);
  const mapLayerRows = await listMapLayersForProject(user, project.id);

  // Ledger pembayaran HANYA untuk admin. Memanggilnya untuk surveyor akan
  // ditolak server-side — tapi jangan bergantung pada itu: jangan panggil sama
  // sekali, supaya tidak ada apa pun yang bisa masuk ke payload non-admin.
  const isAdmin = user.role === "admin";
  const paymentRows = isAdmin ? await listPaymentsForProject(user, project.id) : [];
  const paymentSummary = isAdmin ? await getPaymentSummary(user, project.id) : null;
  const paymentPanelRows = await Promise.all(
    paymentRows.map(async (p) => ({
      id: p.id,
      amount: p.amount,
      paidAt: p.paidAt,
      method: p.method,
      note: p.note,
      receiptNumber: p.receiptNumber,
      downloadUrl: p.receiptFileUrl ? await downloadUrlFor(p.receiptFileUrl) : null,
      voidedReason: p.voidedReason,
      isVoided: p.voidedAt !== null,
    })),
  );

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

  const phases = await listPhasesForProject(user, project.id);
  const progress = await getProjectProgress(user, project.id);
  // Daftar surveyor untuk dropdown penanggung jawab fase — hanya admin yang
  // butuh. Query inline, pola yang sama dengan `app/dashboard/projects/new/page.tsx:18`.
  // BEDANYA: kita saring `archivedAt` — menugaskan fase ke surveyor yang sudah
  // diarsipkan berarti menugaskannya ke orang yang tidak bisa login.
  const phaseSurveyors = isAdmin
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
    : [];

  // Tab "Alat": riwayat pakai alat di proyek ini + daftar alat yang bisa
  // dipinjam. `listUsageForProject` sudah lewat `assertProjectAccess` (di
  // dalam `equipment-logic.ts`), jadi surveyor cuma melihat riwayat proyeknya
  // sendiri — konsisten dengan pola di seluruh halaman ini.
  const projectEquipmentUsages = await listUsageForProject(user, project.id);
  const allEquipment = await listEquipmentForUser(user);
  const equipmentNameById = new Map(allEquipment.map((e) => [e.id, e.name]));

  const equipmentUsageUserIds = [...new Set(projectEquipmentUsages.map((u) => u.usedById))];
  const equipmentUsageUsers = equipmentUsageUserIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, equipmentUsageUserIds))
    : [];
  const equipmentUsageUserNameById = new Map(equipmentUsageUsers.map((u) => [u.id, u.name]));

  const equipmentNow = new Date();
  const equipmentUsageRows: ProjectEquipmentUsageRow[] = projectEquipmentUsages.map((usage) => ({
    id: usage.id,
    equipmentId: usage.equipmentId,
    equipmentName: equipmentNameById.get(usage.equipmentId) ?? "—",
    usedByName: equipmentUsageUserNameById.get(usage.usedById) ?? "—",
    startedAt: usage.startedAt,
    endedAt: usage.endedAt,
    duration: formatDuration(usageDurationMs(usage, equipmentNow)),
    note: usage.note,
    canReturn: usage.endedAt === null && (isAdmin || usage.usedById === user.id),
  }));

  // Boleh dipinjam: tersedia, tidak terarsip, dan tidak sedang dipakai —
  // dihitung di server dari `listEquipmentForUser`, sama seperti spec Task 6.
  const borrowableEquipment = allEquipment
    .filter((e) => e.condition === "tersedia" && !e.archivedAt && !e.activeUsage)
    .map((e) => ({ id: e.id, name: e.name }));

  const uploaderIds = [...new Set(projectDocuments.map((d) => d.uploadedById))];
  const uploaderUsers = uploaderIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, uploaderIds))
    : [];
  const uploaderNameById = new Map(uploaderUsers.map((u) => [u.id, u.name]));

  const documentRows = await Promise.all(
    projectDocuments.map(async (d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      downloadUrl: await downloadUrlFor(d.fileUrl),
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      sharedWithClient: d.sharedWithClient,
      uploaderName: uploaderNameById.get(d.uploadedById) ?? "—",
      createdAt: d.createdAt,
    })),
  );

  const canChangeStatus = user.role === "admin" || project.assignedSurveyorId === user.id;
  const allowedNextStatuses = canChangeStatus
    ? getAllowedNextStatuses(
        project.status as ProjectStatus,
        user.role === "admin" ? "admin" : "surveyor",
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
          {user.role === "admin" ? (
            <ButtonLink variant="outline" href={`/dashboard/projects/${project.id}/edit`}>
              Edit
            </ButtonLink>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fase">Fase</TabsTrigger>
          <TabsTrigger value="peta">Peta</TabsTrigger>
          <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
          <TabsTrigger value="alat">Alat</TabsTrigger>
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

          {user.role === "admin" ? (
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
                  Hanya admin atau surveyor yang ditugaskan yang bisa mengubah status.
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

        <TabsContent value="fase" className="pt-4">
          <PhaseTimeline
            projectId={project.id}
            phases={phases}
            progress={progress}
            today={todayString(new Date())}
            canEditPlan={isAdmin}
            canReportWork={user.role === "admin" || user.role === "surveyor"}
            surveyors={phaseSurveyors}
          />
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
            isAdmin={user.role === "admin"}
            emptyMessage={
              <EmptyState
                icon={FileIcon}
                title="Belum ada dokumen"
                description="Unggah laporan, berita acara, atau foto lapangan untuk proyek ini."
              />
            }
          />
        </TabsContent>

        {/* Tab ini tidak pernah dirender untuk klien — halaman ini hanya
            dashboard staf (klien ada di `/portal`), jadi tidak ada perubahan
            apa pun di portal untuk fitur ini. */}
        <TabsContent value="alat" className="pt-4">
          <ProjectEquipment
            projectId={project.id}
            usages={equipmentUsageRows}
            borrowable={borrowableEquipment}
            canRecord={user.role !== "client"}
            isAdmin={isAdmin}
            surveyors={phaseSurveyors}
          />
        </TabsContent>

        {/* Both the trigger above and this panel only exist in the tree when
            `"projectValue" in project` — which is only true for an admin's
            payload (see `getProjectDetailForUser`). A surveyor's `project`
            never has this key, so this branch is unreachable for them and
            no finance data is ever part of their RSC payload. */}
        {"projectValue" in project ? (
          <TabsContent value="keuangan" className="flex flex-col gap-6 pt-4">
            {paymentSummary ? (
              <Card>
                <CardHeader>
                  <CardTitle>Pembayaran</CardTitle>
                </CardHeader>
                <CardContent>
                  <PaymentsPanel
                    projectId={project.id}
                    rows={paymentPanelRows}
                    projectValue={paymentSummary.projectValue}
                    totalPaid={paymentSummary.totalPaid}
                    remaining={paymentSummary.remaining}
                    status={paymentSummary.status}
                  />
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Nilai proyek & catatan</CardTitle>
              </CardHeader>
              <CardContent>
                <PaymentForm
                  projectId={project.id}
                  projectValue={project.projectValue}
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
