"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { reorderPhases } from "@/lib/actions/phases";

/**
 * Admin-only. `orderedPhaseIds` HARUS berisi SEMUA fase proyek — server
 * menolak daftar sebagian (lihat `reorderPhasesForUser`). Kita hitung urutan
 * baru LENGKAP di sini (tukar posisi `index` dengan tetangganya) sebelum
 * mengirim, bukan mengirim satu id "pindahkan".
 */
export function PhaseReorderButtons({
  projectId,
  orderedPhaseIds,
  index,
}: {
  projectId: string;
  orderedPhaseIds: string[];
  index: number;
}) {
  const router = useRouter();
  const { executeAsync, isExecuting } = useAction(reorderPhases);

  async function move(delta: number) {
    const target = index + delta;
    if (target < 0 || target >= orderedPhaseIds.length) return;

    const next = [...orderedPhaseIds];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;

    await executeAsync({ projectId, orderedPhaseIds: next });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={isExecuting || index === 0}
        onClick={() => move(-1)}
        aria-label="Naikkan urutan fase"
      >
        <ChevronUpIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={isExecuting || index === orderedPhaseIds.length - 1}
        onClick={() => move(1)}
        aria-label="Turunkan urutan fase"
      >
        <ChevronDownIcon />
      </Button>
    </div>
  );
}
