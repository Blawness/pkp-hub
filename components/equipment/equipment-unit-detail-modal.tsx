"use client";

import { useEffect, useState } from "react";
import { EquipmentUnitDetailContent } from "@/components/equipment/equipment-unit-detail-content";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getEquipmentDetail } from "@/lib/actions/equipment-detail";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/** Modal detail unit untuk tampilan Tabel (spesifikasi 2026-07-30). Konten
 * persis sama dengan halaman `/dashboard/equipment/unit/[unitId]` — di-
 * ekstrak ke `EquipmentUnitDetailContent` agar tidak ada drift visual.
 *
 * Data diambil via server action `getEquipmentDetail` SETIAP KALI modal
 * dibuka (bukan sekali per sesi) — supaya setelah pinjam/kembalikan/edit dari
 * dalam modal, refetch langsung terjadi dan kondisi baru terlihat tanpa
 * menutup modal. Action pinjam/kembalikan/edit sendiri sudah memanggil
 * `revalidatePath` untuk `/dashboard/equipment`, jadi halaman di belakang
 * modal juga ikut fresh. */

export function EquipmentUnitDetailModal({
  unitId,
  open,
  onOpenChange,
  isAdmin,
  projectOptions,
  surveyors,
  currentUserId,
}: {
  /** null saat modal tertutup. */
  unitId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  currentUserId: string;
}) {
  const { execute, result, isExecuting, hasErrored } = useToastAction(getEquipmentDetail);
  const [hasFetchedFor, setHasFetchedFor] = useState<string | null>(null);

  // Fetch on open, ATAU saat unitId berganti (buka unit lain tanpa menutup
  // modal). `hasFetchedFor` mencegah double-fetch di re-render pertama.
  useEffect(() => {
    if (!open || !unitId || unitId === hasFetchedFor) return;
    execute({ unitId });
    setHasFetchedFor(unitId);
  }, [open, unitId, hasFetchedFor, execute]);

  // Reset tracker saat modal ditutup supaya buka berikutnya selalu fresh.
  useEffect(() => {
    if (!open) setHasFetchedFor(null);
  }, [open]);

  const payload = result?.data?.success && result.data.item.id === unitId ? result.data : null;
  const canReturnActive = Boolean(
    payload?.item.activeUsage && (isAdmin || payload.item.activeUsage.usedById === currentUserId),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {unitId ? (
          <>
            <DialogHeader className="sr-only">
              <DialogTitle>Detail unit</DialogTitle>
              <DialogDescription>Informasi lengkap satu unit alat ukur.</DialogDescription>
            </DialogHeader>
            {isExecuting && !payload ? (
              <p className="text-sm text-muted-foreground">Memuat detail unit…</p>
            ) : hasErrored ? (
              <p className="text-sm text-destructive">
                Gagal memuat detail. Coba tutup dan buka lagi.
              </p>
            ) : payload ? (
              <EquipmentUnitDetailContent
                payload={payload}
                isAdmin={isAdmin}
                projectOptions={projectOptions}
                surveyors={surveyors}
                canReturnActive={canReturnActive}
              />
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
