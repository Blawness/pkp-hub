"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(archiveEquipment);

  async function handleArchive() {
    if (!window.confirm(`Arsipkan alat "${equipmentName}"? Alat tidak akan bisa dipinjam lagi.`)) {
      return;
    }
    setError(null);
    const result = await executeAsync({ equipmentId });
    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="destructive" size="sm" disabled={isExecuting} onClick={handleArchive}>
        {isExecuting ? "Menyimpan..." : "Arsipkan"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
