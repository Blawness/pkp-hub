"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { archiveEquipmentItem } from "@/lib/actions/equipment-items";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/**
 * Admin-only. Server (`archiveEquipmentItemForUser`) menegakkan ulang perannya
 * DAN menolak jenis yang masih punya unit — ini bukan gantinya. Tombol tetap
 * dirender walau jenisnya masih berisi unit: penolakannya datang dengan pesan
 * yang menyebut jumlah unitnya, yang lebih menjelaskan daripada tombol mati
 * tanpa alasan. `ConfirmDialog` menampilkan pesan itu di dalam dialog tanpa
 * menutupnya.
 */
export function ArchiveEquipmentItemButton({
  itemId,
  itemName,
}: {
  itemId: string;
  itemName: string;
}) {
  const router = useRouter();
  const { executeAsync } = useToastAction(archiveEquipmentItem, {
    successMessage: "Unit diarsipkan.",
  });

  async function handleArchive(): Promise<{ error?: string } | undefined> {
    const result = await executeAsync({ itemId });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline">
          Hapus
        </Button>
      }
      title="Hapus jenis alat?"
      description={`"${itemName}" akan hilang dari daftar inventaris. Riwayat pakai unitnya tetap tersimpan.`}
      confirmLabel="Hapus"
      confirmVariant="destructive"
      onConfirm={handleArchive}
    />
  );
}
