"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { archiveEquipment } from "@/lib/actions/equipment";

/**
 * Admin-only. Server (`archiveEquipmentForUser`) menegakkan ulang perannya — ini bukan gantinya.
 *
 * Kata "Hapus" dipakai, bukan "Arsipkan", supaya seragam dengan hapus JENIS
 * alat: keduanya soft delete dengan efek yang sama dari sisi pengguna (hilang
 * dari daftar, riwayat tetap tersimpan), jadi tidak ada gunanya dua kata untuk
 * satu konsep yang sama.
 */
export function ArchiveEquipmentButton({
  equipmentId,
  equipmentName,
  trigger,
}: {
  equipmentId: string;
  equipmentName: string;
  trigger?: ReactElement;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(archiveEquipment);

  async function handleArchive(): Promise<{ error?: string } | undefined> {
    const result = await executeAsync({ equipmentId });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        trigger ?? (
          <Button size="sm" variant="destructive">
            Hapus
          </Button>
        )
      }
      title="Hapus unit alat?"
      description={`"${equipmentName}" akan hilang dari daftar dan tidak bisa dipinjam lagi. Riwayat pakainya tetap tersimpan.`}
      confirmLabel="Hapus"
      confirmVariant="destructive"
      onConfirm={handleArchive}
    />
  );
}
