import { DocumentsTable } from "@/components/documents/documents-table";
import { PetaView } from "@/components/map/peta-view";
import { StatusHistory } from "@/components/projects/status-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listSharedDocumentsForProject } from "@/lib/actions/documents-logic";
import { listMapLayersForProject } from "@/lib/actions/maps-logic";
import { getStatusLogsForProject } from "@/lib/actions/projects-logic";
import { assertProjectAccess, requireClient } from "@/lib/auth-guards";
import { formatIDR } from "@/lib/format";
import { formatArea } from "@/lib/geo/area";
import { paymentStatusLabel, statusLabel, surveyTypeLabel } from "@/lib/labels";

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
export default async function PortalProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireClient();

  const project = await assertProjectAccess(id, user);
  const statusLogs = await getStatusLogsForProject(project.id);
  const mapLayerRows = await listMapLayersForProject(user, project.id);
  const documentRows = await listSharedDocumentsForProject(user, project.id);

  const totalAreaSqm = mapLayerRows.reduce((sum, l) => sum + (l.areaSqm ?? 0), 0);

  const documentTableRows = documentRows.map((d) => ({
    id: d.id,
    name: d.name,
    category: d.category,
    fileUrl: d.fileUrl,
    fileSize: d.fileSize,
    mimeType: d.mimeType,
    sharedWithClient: d.sharedWithClient,
    uploaderName: "—",
    createdAt: d.createdAt,
  }));

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
        <Badge variant="secondary">{statusLabel[project.status] ?? project.status}</Badge>
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
            isOwner={false}
            emptyMessage="Belum ada dokumen yang dibagikan untuk proyek ini."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nilai & pembayaran</CardTitle>
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
          {project.paymentNotes ? (
            <div className="sm:col-span-2">
              <p className="text-xs text-muted-foreground">Catatan</p>
              <p className="text-sm">{project.paymentNotes}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
