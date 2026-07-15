"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { returnEquipment } from "@/lib/actions/equipment";

/**
 * Menutup sesi pakai yang sedang berjalan, dengan konfirmasi. `usageId` datang
 * dari sesi yang SUDAH lolos guard di server, jadi tombol ini hanya dirender
 * untuk sesi yang boleh caller tutup — `returnEquipmentForUser` tetap
 * menegakkan itu ulang, ini bukan gantinya.
 */
export function ReturnButton({
  usageId,
  equipmentName,
  durationLabel,
}: {
  usageId: string;
  equipmentName?: string;
  durationLabel?: string;
}) {
  const router = useRouter();
  const { executeAsync } = useAction(returnEquipment);

  async function handleReturn(): Promise<{ error?: string } | void> {
    const result = await executeAsync({ usageId });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  const namePart = equipmentName ? ` ${equipmentName}` : " alat ini";
  const durationPart = durationLabel ? ` Sudah berjalan ${durationLabel}.` : "";

  return (
    <ConfirmDialog
      trigger={
        <Button size="sm" variant="outline">
          Kembalikan
        </Button>
      }
      title="Kembalikan alat?"
      description={`Menutup sesi pakai${namePart}.${durationPart}`}
      confirmLabel="Kembalikan"
      onConfirm={handleReturn}
    />
  );
}
