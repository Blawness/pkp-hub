"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { archiveEquipmentItem } from "@/lib/actions/equipment-items";

/**
 * Admin-only. Server (`archiveEquipmentItemForUser`) menegakkan ulang perannya
 * DAN menolak jenis yang masih punya unit — ini bukan gantinya. Tombol tetap
 * dirender walau jenisnya masih berisi unit: penolakannya datang dengan pesan
 * yang menyebut jumlah unitnya, yang lebih menjelaskan daripada tombol mati
 * tanpa alasan.
 */
export function ArchiveEquipmentItemButton({
  itemId,
  itemName,
}: {
  itemId: string;
  itemName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(archiveEquipmentItem);

  async function handleArchive() {
    if (!window.confirm(`Hapus jenis alat "${itemName}"?`)) return;

    setError(null);
    const result = await executeAsync({ itemId });
    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    router.refresh();
  }

  return (
    // Pesan error diposisikan absolut: kalau ikut alur normal, lebarnya
    // melebarkan baris tombol dan menggeser "Edit" keluar dari sejajarnya
    // dengan kartu-kartu lain.
    <div className="relative">
      <Button variant="outline" size="sm" disabled={isExecuting} onClick={handleArchive}>
        {isExecuting ? "Menghapus..." : "Hapus"}
      </Button>
      {error ? (
        <p className="absolute top-full right-0 mt-1 w-56 text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
