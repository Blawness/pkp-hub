"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { returnEquipment } from "@/lib/actions/equipment";

/**
 * Menutup sesi pakai yang sedang berjalan. `usageId` datang dari sesi yang
 * SUDAH lolos guard di server (`getEquipmentForUser`/`listUsageForEquipment`),
 * jadi tombol ini hanya dirender untuk sesi yang boleh caller tutup — server
 * (`returnEquipmentForUser`) tetap menegakkan itu ulang, ini bukan gantinya.
 */
export function ReturnButton({ usageId }: { usageId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(returnEquipment);

  async function handleReturn() {
    setError(null);
    const result = await executeAsync({ usageId });
    if (result?.serverError) {
      setError(result.serverError);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <Button size="sm" variant="outline" disabled={isExecuting} onClick={handleReturn}>
        {isExecuting ? "Menyimpan..." : "Kembalikan"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
