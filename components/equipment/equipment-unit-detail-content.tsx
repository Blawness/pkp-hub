"use client";

import { ImageIcon } from "lucide-react";
import { ArchiveEquipmentButton } from "@/components/equipment/archive-equipment-button";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { UsageHistory, type UsageHistoryRow } from "@/components/equipment/usage-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { EquipmentListItem } from "@/lib/actions/equipment-logic";
import type { EquipmentConditionInput } from "@/lib/actions/equipment-schemas";
import { formatIDR } from "@/lib/format";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

/** Re-use tipe dari logic — bukan duplikasi — supaya aturan field
 * admin-only (`purchaseDate`/`purchasePrice`) untuk surveyor tetap satu
 * sumber kebenaran. */
export type EquipmentUnitDetail = EquipmentListItem;

export type EquipmentUnitDetailPayload = {
  item: EquipmentUnitDetail;
  imageDisplayUrl: string | null;
  usageRows: UsageHistoryRow[];
  activeDuration: string | null;
};

/**
 * Konten visual halaman detail unit — diekstrak dari `unit/[unitId]/page.tsx`
 * (spesifikasi 2026-07-30) supaya bisa dipakai ulang oleh modal di tampilan
 * Tabel. Server Component asal masih memakai komponen ini juga dengan prop
 * yang sama, sehingga tidak ada drift visual.
 *
 * Pemanggil (page atau modal) yang menghitung durasi di SERVER — supaya
 * tidak ada mismatch hidrasi antara jam render server dan jam browser (lihat
 * komentar di `usage-history.tsx`).
 */
export function EquipmentUnitDetailContent({
  payload,
  isAdmin,
  projectOptions,
  surveyors,
  canReturnActive,
}: {
  payload: EquipmentUnitDetailPayload;
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  /** Computed by caller — perlu info siapa user, tak tersedia di sini. */
  canReturnActive: boolean;
}) {
  const { item, imageDisplayUrl, usageRows, activeDuration } = payload;
  const displayName = `${item.itemName} (${item.code})`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-medium">{displayName}</h2>
          <p className="text-xs text-muted-foreground">
            {equipmentCategoryLabel[item.category] ?? item.category}
            {item.serialNumber ? ` · SN ${item.serialNumber}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary">
            {equipmentConditionLabel[item.condition] ?? item.condition}
          </Badge>
          {isAdmin && !item.archivedAt ? (
            <>
              <EquipmentFormDialog
                itemId={item.itemId}
                itemName={item.itemName}
                editing={{
                  equipmentId: item.id,
                  code: item.code,
                  serialNumber: item.serialNumber,
                  condition: item.condition as EquipmentConditionInput,
                  purchaseDate: "purchaseDate" in item ? item.purchaseDate : null,
                  purchasePrice: "purchasePrice" in item ? item.purchasePrice : null,
                  notes: item.notes,
                }}
              />
              <ArchiveEquipmentButton equipmentId={item.id} equipmentName={displayName} />
            </>
          ) : null}
        </div>
      </div>

      <div className="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {imageDisplayUrl ? (
          // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis yang bisa dioptimasi
          <img src={imageDisplayUrl} alt={item.itemName} className="h-full w-full object-contain" />
        ) : (
          <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden />
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
                  equipmentName={displayName}
                  durationLabel={activeDuration ?? undefined}
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Tersedia — tidak sedang dipakai.</p>
              {item.condition === "tersedia" && !item.archivedAt ? (
                <BorrowDialog
                  fixedEquipment={{ id: item.id, name: displayName }}
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
          <UsageHistory rows={usageRows} equipmentName={displayName} />
        </CardContent>
      </Card>
    </div>
  );
}
