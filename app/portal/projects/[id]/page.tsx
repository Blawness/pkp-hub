import { FileIcon } from "lucide-react";
import { DocumentsTable } from "@/components/documents/documents-table";
import { PetaView } from "@/components/map/peta-view";
import { PortalPayments } from "@/components/payments/portal-payments";
import { PhaseTimeline } from "@/components/projects/phase-timeline";
import { StatusBadge } from "@/components/projects/status-badge";
import { StatusHistory } from "@/components/projects/status-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listSharedDocumentsForProject } from "@/lib/actions/documents-logic";
import { listMapLayersForProject } from "@/lib/actions/maps-logic";
import { getPaymentSummary, listPaymentsForProject } from "@/lib/actions/payments-logic";
import { getPortalProgress, listPortalPhases } from "@/lib/actions/portal-logic";
import { getStatusLogsForProject } from "@/lib/actions/projects-logic";
import { assertProjectAccess, requireClient } from "@/lib/auth-guards";
import { formatArea } from "@/lib/geo/area";
import { surveyTypeLabel } from "@/lib/labels";
import { todayString } from "@/lib/phases/derive";
import { getRbacContext } from "@/lib/rbac/context";
import { downloadUrlFor } from "@/lib/storage";

/**
 * Client portal project detail (PRD §3 Feature 6): status + history, a
 * READ-ONLY map, documents where `sharedWithClient = true` ONLY, computed
 * area, and project value + payment status (also read-only — no form here).
 *
 * `assertProjectAccess` is called directly (not through a translated
 * wrapper) so a client requesting another tenant's project id gets a real
 * `notFound()` — same pattern as the staff project detail page. The two
 * helpers below independently re-verify access (defense in depth) and
 * `listSharedDocumentsForProject` additionally enforces the
 * shared-documents-only filter unconditionally.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClient();
  const project = await assertProjectAccess(id, user);
  return { title: project.title };
}

export default async function PortalProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireClient();
  const ctx = await getRbacContext();

  const project = await assertProjectAccess(id, user);
  const statusLogs = await getStatusLogsForProject(project.id);
  const phases = await listPortalPhases(ctx, project.id);
  const phaseProgress = await getPortalProgress(ctx, project.id);
  const mapLayerRows = await listMapLayersForProject(ctx, project.id);
  const documentRows = await listSharedDocumentsForProject(ctx, project.id);
  const paymentRows = await listPaymentsForProject(ctx, project.id);
  const paymentSummary = await getPaymentSummary(ctx, project.id);
  const paymentTableRows = await Promise.all(
    paymentRows.map(async (p) => ({
      id: p.id,
      amount: p.amount,
      paidAt: p.paidAt,
      method: p.method,
      receiptNumber: p.receiptNumber,
      downloadUrl: p.receiptFileUrl ? await downloadUrlFor(p.receiptFileUrl) : null,
    })),
  );

  const totalAreaSqm = mapLayerRows.reduce((sum, l) => sum + (l.areaSqm ?? 0), 0);

  const documentTableRows = await Promise.all(
    documentRows.map(async (d) => ({
      id: d.id,
      name: d.name,
      category: d.category,
      downloadUrl: await downloadUrlFor(d.fileUrl),
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      sharedWithClient: d.sharedWithClient,
      uploaderName: "—",
      createdAt: d.createdAt,
    })),
  );

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-medium">{project.title}</h1>
          <p className="text-sm text-muted-foreground">
            {surveyTypeLabel[project.surveyType] ?? project.surveyType}
            {project.locationLabel ? ` · ${project.locationLabel}` : ""}
          </p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat status</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusHistory
            logs={statusLogs.map((log) => ({
              id: log.id,
              fromStatus: log.fromStatus,
              toStatus: log.toStatus,
              changedByName: "PKP Hub",
              createdAt: log.createdAt,
            }))}
          />
        </CardContent>
      </Card>

      {phases.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Timeline fase</CardTitle>
          </CardHeader>
          <CardContent>
            <PhaseTimeline
              projectId={project.id}
              phases={phases}
              progress={phaseProgress}
              today={todayString(new Date())}
              canEditPlan={false}
              canReportWork={false}
              surveyors={[]}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Peta</CardTitle>
        </CardHeader>
        <CardContent>
          <PetaView
            layers={mapLayerRows.map((l) => ({
              id: l.id,
              name: l.name,
              // biome-ignore lint/suspicious/noExplicitAny: jsonb column, shape validated at write time by maps-schemas.ts.
              geojson: l.geojson as any,
              areaSqm: l.areaSqm,
              source: l.source,
            }))}
          />
          {totalAreaSqm > 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Luas total: {formatArea(totalAreaSqm).label}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dokumen</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentsTable
            rows={documentTableRows}
            isAdmin={false}
            emptyMessage={
              <EmptyState
                icon={FileIcon}
                title="Belum ada dokumen"
                description="Studio belum membagikan dokumen untuk proyek ini."
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nilai & pembayaran</CardTitle>
        </CardHeader>
        <CardContent>
          <PortalPayments
            rows={paymentTableRows}
            projectValue={paymentSummary.projectValue}
            totalPaid={paymentSummary.totalPaid}
            remaining={paymentSummary.remaining}
            status={paymentSummary.status}
            paymentNotes={project.paymentNotes}
          />
        </CardContent>
      </Card>
    </main>
  );
}
