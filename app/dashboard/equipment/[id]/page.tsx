import { and, eq, inArray, isNull } from "drizzle-orm";
import { ImageIcon } from "lucide-react";
import { ArchiveEquipmentButton } from "@/components/equipment/archive-equipment-button";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { UsageHistory, type UsageHistoryRow } from "@/components/equipment/usage-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEquipmentForUser, listUsageForEquipment } from "@/lib/actions/equipment-logic";
import type {
  EquipmentCategoryInput,
  EquipmentConditionInput,
} from "@/lib/actions/equipment-schemas";
import { listProjectsForUser, requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { formatDuration, usageDurationMs } from "@/lib/equipment/derive";
import { formatIDR } from "@/lib/format";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";
import { downloadUrlFor } from "@/lib/storage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const item = await getEquipmentForUser(user, id);
  return { title: item.name };
}

/**
 * Detail alat + riwayat pakai. `requireStaff()` adalah gerbang halaman ini —
 * klien tidak pernah sampai kemari.
 *
 * Harga & tanggal beli hanya dirender kalau `"purchasePrice" in item` — yang
 * hanya benar untuk payload admin (`getEquipmentForUser` memangkas dua field
 * itu dari bentuk objeknya sendiri untuk surveyor, bukan cuma
 * menyembunyikannya di UI).
 */
export default async function EquipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";

  const item = await getEquipmentForUser(user, id);
  const usages = await listUsageForEquipment(user, id);
  const imageDisplayUrl = item.image ? await downloadUrlFor(item.image) : null;

  const userProjects = await listProjectsForUser(user);
  const projectOptions = userProjects.map((p) => ({ id: p.id, title: p.title }));
  const surveyors = isAdmin
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
    : [];
  const canReturnActive =
    item.activeUsage !== null && (isAdmin || item.activeUsage.usedById === user.id);

  const projectIds = [...new Set(usages.map((u) => u.projectId))];
  const userIds = [...new Set(usages.map((u) => u.usedById))];

  const [projectRows, userRows] = await Promise.all([
    projectIds.length
      ? db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : Promise.resolve([]),
    userIds.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);
  const projectTitleById = new Map(projectRows.map((p) => [p.id, p.title]));
  const userNameById = new Map(userRows.map((u) => [u.id, u.name]));

  const now = new Date();
  const usageRows: UsageHistoryRow[] = usages.map((usage) => ({
    id: usage.id,
    projectId: usage.projectId,
    projectTitle: projectTitleById.get(usage.projectId) ?? "—",
    usedByName: userNameById.get(usage.usedById) ?? "—",
    startedAt: usage.startedAt,
    endedAt: usage.endedAt,
    // Durasi dihitung di SERVER — bukan di komponen klien, supaya tidak ada
    // mismatch hidrasi antara jam render server dan jam browser.
    duration: formatDuration(usageDurationMs(usage, now)),
    note: usage.note,
    canReturn: usage.endedAt === null && (isAdmin || usage.usedById === user.id),
  }));

  // Dihitung sekali di sini (bukan dua kali di JSX) supaya teks inline dan
  // `ReturnButton` selalu menampilkan durasi yang identik.
  const activeDuration = item.activeUsage
    ? formatDuration(usageDurationMs({ startedAt: item.activeUsage.startedAt, endedAt: null }, now))
    : null;

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">{item.name}</h1>
          <p className="text-sm text-muted-foreground">
            {equipmentCategoryLabel[item.category] ?? item.category}
            {item.serialNumber ? ` · SN ${item.serialNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {equipmentConditionLabel[item.condition] ?? item.condition}
          </Badge>
          {isAdmin && !item.archivedAt ? (
            <>
              <EquipmentFormDialog
                editing={{
                  equipmentId: item.id,
                  name: item.name,
                  category: item.category as EquipmentCategoryInput,
                  serialNumber: item.serialNumber,
                  condition: item.condition as EquipmentConditionInput,
                  image: item.image,
                  imageDisplayUrl,
                  purchaseDate: "purchaseDate" in item ? item.purchaseDate : null,
                  purchasePrice: "purchasePrice" in item ? item.purchasePrice : null,
                  notes: item.notes,
                }}
              />
              <ArchiveEquipmentButton equipmentId={item.id} equipmentName={item.name} />
            </>
          ) : null}
        </div>
      </div>

      <div className="flex h-48 w-full max-w-sm items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {imageDisplayUrl ? (
          // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis yang bisa dioptimasi
          <img src={imageDisplayUrl} alt={item.name} className="h-full w-full object-contain" />
        ) : (
          <ImageIcon className="h-10 w-10 text-muted-foreground" aria-hidden />
        )}
      </div>

      {item.archivedAt ? (
        <p className="text-sm text-muted-foreground">Alat ini sudah diarsipkan.</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Status pakai</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {item.activeUsage ? (
            <>
              <p className="text-sm">
                Sedang dipakai oleh{" "}
                <span className="font-medium">{item.activeUsage.usedByName}</span> untuk proyek{" "}
                <span className="font-medium">{item.activeUsage.projectTitle}</span> · berjalan{" "}
                {activeDuration}
              </p>
              {canReturnActive ? (
                <ReturnButton
                  usageId={item.activeUsage.usageId}
                  equipmentName={item.name}
                  durationLabel={activeDuration ?? undefined}
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Tersedia — tidak sedang dipakai.</p>
              {item.condition === "tersedia" && !item.archivedAt ? (
                <BorrowDialog
                  fixedEquipment={{ id: item.id, name: item.name }}
                  projectOptions={projectOptions}
                  isAdmin={isAdmin}
                  surveyors={surveyors}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {"purchasePrice" in item ? (
        <Card>
          <CardHeader>
            <CardTitle>Data pembelian</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Tanggal beli</p>
              <p className="text-sm">{item.purchaseDate ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Harga beli</p>
              <p className="text-sm">{formatIDR(item.purchasePrice)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {item.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Catatan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{item.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Riwayat pakai</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageHistory rows={usageRows} equipmentName={item.name} />
        </CardContent>
      </Card>
    </main>
  );
}
