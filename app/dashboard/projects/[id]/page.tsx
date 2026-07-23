import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { FileIcon } from "lucide-react";
import type { z } from "zod";
import { DocumentUpload } from "@/components/documents/document-upload";
import { DocumentsTable } from "@/components/documents/documents-table";
import {
  ProjectEquipment,
  type ProjectEquipmentUsageRow,
} from "@/components/equipment/project-equipment";
import { PetaTab } from "@/components/map/peta-tab";
import { PaymentsPanel } from "@/components/payments/payments-panel";
import { PaymentForm } from "@/components/projects/payment-form";
import { PhaseTimeline } from "@/components/projects/phase-timeline";
import { ProjectSummary } from "@/components/projects/project-summary";
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
import type { projectInputSchema } from "@/lib/actions/projects-schemas";
import { db } from "@/lib/db";
import { clients, users } from "@/lib/db/schema";
import { formatDuration, usageDurationMs } from "@/lib/equipment/derive";
import { todayString } from "@/lib/phases/derive";
import { can, scopeOf } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { downloadUrlFor } from "@/lib/storage";

type ProjectFormValues = z.infer<typeof projectInputSchema>;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Defense in depth: re-run the same scoped lookup `generateMetadata` will
  // otherwise skip if it ran before the page body — `getProjectDetailForUser`
  // 404s a surveyor who isn't assigned rather than leaking the title.
  const ctx = await getRbacContext();
  const project = await getProjectDetailForUser(ctx, id);
  return { title: project.title };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getRbacContext();
  // Domain-domain lain di halaman ini belum bermigrasi ke `ctx`; sampai
  // pass-nya tiba mereka tetap menerima `user`. Area-gate staf tetap ditegakkan
  // oleh `app/dashboard/layout.tsx`.
  const user = ctx.user;

  // Mandatory scoping rule: `getProjectDetailForUser` (lewat `requireScopedRow`)
  // adalah satu-satunya pintu baca satu proyek di sini — ia 404 surveyor yang
  // tak ditugaskan ke proyek ini, DAN `redact` membuang `projectValue` /
  // `paymentStatus` / `paymentNotes` dari objek untuk pemanggil tanpa
  // `project.readFinance` (regresi Phase 6+7 — CRITICAL). `project` di bawah tak
  // pernah punya key itu kecuali `ctx` boleh membaca finance.
  const project = await getProjectDetailForUser(ctx, id);

  // Empat pembacaan ini hanya bergantung pada `project`/`user` dan tidak saling
  // membutuhkan — dijalankan paralel supaya waktu buka halaman detail (yang
  // berat: 6 tab) tidak menumpuk empat round-trip DB berurutan.
  const [client, statusLogs, projectDocuments, mapLayerRows] = await Promise.all([
    getClientById(project.clientId),
    getStatusLogsForProject(project.id),
    listDocumentsForProject(ctx, project.id),
    listMapLayersForProject(ctx, project.id),
  ]);

  // Ledger pembayaran HANYA untuk pemegang `payment.read` (surveyor tidak
  // punya sama sekali). Memanggilnya tanpa izin akan ditolak server-side —
  // tapi jangan bergantung pada itu: jangan panggil sama sekali, supaya tidak
  // ada apa pun yang bisa masuk ke payload-nya. `project.update` (admin-only)
  // menggerbangi aksi kelola proyek di bawah.
  const isAdmin = can(ctx, "project.update");
  const canReadPayments = can(ctx, "payment.read");
  const paymentRows = canReadPayments ? await listPaymentsForProject(ctx, project.id) : [];
  const paymentSummary = canReadPayments ? await getPaymentSummary(ctx, project.id) : null;
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

  // Klien untuk dropdown edit proyek: kecualikan klien terarsip, KECUALI
  // klien proyek ini sendiri kalau kebetulan terarsip — meniru guard di
  // halaman `/[id]/edit` yang dihapus, supaya klien saat ini tidak hilang
  // diam-diam dari opsi dropdown.
  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(or(isNull(clients.archivedAt), eq(clients.id, project.clientId)));

  const phases = await listPhasesForProject(ctx, project.id);
  const progress = await getProjectProgress(ctx, project.id);
  const phasesDone = phases.filter((p) => p.status === "selesai").length;
  const phasesTotal = phases.length;
  // Daftar surveyor untuk dropdown penanggung jawab fase — hanya admin yang
  // butuh. Query inline, sama seperti `surveyorRows` di atas. BEDANYA: kita
  // saring `archivedAt` — menugaskan fase ke surveyor yang sudah diarsipkan
  // berarti menugaskannya ke orang yang tidak bisa login.
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
  const projectEquipmentUsages = await listUsageForProject(ctx, project.id);
  const allEquipment = await listEquipmentForUser(ctx);
  // "${itemName} (${code})" — beberapa unit sejenis kini mungkin ada (spec
  // 2026-07-16), jadi nama alat saja tidak lagi cukup membedakan unit mana.
  const equipmentNameById = new Map(allEquipment.map((e) => [e.id, `${e.itemName} (${e.code})`]));

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
  // dihitung di server dari `listEquipmentForUser`.
  const borrowableEquipment = allEquipment
    .filter((e) => e.condition === "tersedia" && !e.archivedAt && !e.activeUsage)
    .map((e) => ({ id: e.id, name: `${e.itemName} (${e.code})` }));

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

  // Scope `all` (admin) selalu boleh; scope `assigned` hanya kalau DITUGASKAN
  // LANGSUNG — cermin tombol lama, meski server juga meloloskan surveyor yang
  // ditugaskan lewat fase (requireScopedRow memakai aturan `assigned` penuh).
  const changeStatusScope = scopeOf(ctx, "project.changeStatus");
  const canChangeStatus =
    changeStatusScope === "all" ||
    (changeStatusScope === "assigned" && project.assignedSurveyorId === user.id);
  const allowedNextStatuses = canChangeStatus
    ? getAllowedNextStatuses(
        project.status as ProjectStatus,
        changeStatusScope === "all" ? "admin" : "surveyor",
      )
    : [];
  const assignedSurveyorName = project.assignedSurveyorId
    ? (nameById.get(project.assignedSurveyorId) ??
      surveyorRows.find((s) => s.id === project.assignedSurveyorId)?.name ??
      "—")
    : "—";

  return (
    <main className="flex flex-col gap-6 p-8">
      <ProjectSummary
        projectId={project.id}
        title={project.title}
        surveyType={project.surveyType}
        clientId={client?.id ?? null}
        clientName={client?.name ?? null}
        surveyorName={assignedSurveyorName}
        assignedSurveyorId={project.assignedSurveyorId}
        surveyors={surveyorRows}
        clients={clientRows}
        editProject={{
          id: project.id,
          title: project.title,
          clientId: project.clientId,
          // `getProjectDetailForUser` widens `surveyType` to `string` in its
          // field-by-field projection (see `ProjectDetailBase` in
          // projects-logic.ts) — safe to narrow back here since the value
          // always comes straight from the DB enum column.
          surveyType: project.surveyType as ProjectFormValues["surveyType"],
          locationLabel: project.locationLabel ?? null,
          assignedSurveyorId: project.assignedSurveyorId,
          orderDate: project.orderDate,
          description: project.description ?? null,
        }}
        isAdmin={isAdmin}
        canEdit={can(ctx, "project.update")}
        status={project.status}
        allowedNextStatuses={allowedNextStatuses}
        logs={statusLogs.map((log) => ({
          id: log.id,
          fromStatus: log.fromStatus,
          toStatus: log.toStatus,
          changedByName: nameById.get(log.changedById) ?? "—",
          createdAt: log.createdAt,
        }))}
        progressPercent={progress}
        phasesDone={phasesDone}
        phasesTotal={phasesTotal}
        remaining={paymentSummary ? paymentSummary.remaining : null}
        paymentStatus={paymentSummary ? paymentSummary.status : null}
        locationLabel={project.locationLabel ?? null}
        orderDate={project.orderDate}
        description={project.description ?? null}
      />

      <Tabs defaultValue="fase">
        <TabsList className="max-w-full overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="fase">Fase</TabsTrigger>
          <TabsTrigger value="peta">Peta</TabsTrigger>
          <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
          <TabsTrigger value="alat">Alat</TabsTrigger>
          {"projectValue" in project ? <TabsTrigger value="keuangan">Keuangan</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="fase" className="pt-4">
          <PhaseTimeline
            projectId={project.id}
            phases={phases}
            progress={progress}
            today={todayString(new Date())}
            canEditPlan={can(ctx, "phase.update")}
            canReportWork={can(ctx, "phase.setStatus")}
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
            isAdmin={can(ctx, "document.share")}
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
                  projectValue={project.projectValue ?? null}
                  paymentNotes={project.paymentNotes ?? null}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </main>
  );
}
