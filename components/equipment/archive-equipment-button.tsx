"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { archiveEquipment } from "@/lib/actions/equipment";

/** Admin-only. Server (`archiveEquipmentForUser`) menegakkan ulang perannya — ini bukan gantinya. */
export function ArchiveEquipmentButton({
  equipmentId,
  equipmentName,
}: {
  equipmentId: string;
  equipmentName: string;
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
        <Button variant="destructive" size="sm">
          Arsipkan
        </Button>
      }
      title="Arsipkan alat?"
      description={`"${equipmentName}" tidak akan bisa dipinjam lagi. Riwayat pakainya tetap tersimpan.`}
      confirmLabel="Arsipkan"
      confirmVariant="destructive"
      onConfirm={handleArchive}
    />
  );
}
