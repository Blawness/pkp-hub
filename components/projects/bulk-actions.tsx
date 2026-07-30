"use client";

import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkAdvanceStatus } from "@/lib/actions/projects";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/**
 * Toolbar aksi massal. Muncul saat ada baris terpilih.
 * `onDone` dipanggil setelah aksi selesai (untuk reset selection).
 */
export function BulkActions({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const { execute, isPending } = useToastAction(bulkAdvanceStatus, {
    onSuccess: onDone,
  });

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
      <span className="text-sm font-medium">{selectedIds.length} dipilih</span>
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => execute({ projectIds: selectedIds })}
      >
        <ArrowRightIcon className="size-4" />
        Majukan status
      </Button>
    </div>
  );
}
