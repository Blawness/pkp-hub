"use client";

import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bulkRevokeSessionsAction } from "@/lib/actions/session";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/**
 * Toolbar aksi massal untuk tabel sesi. Muncul saat ada checkbox yang
 * dicentang. Anti-self-revoke ditangani di `bulkRevokeSessions` — sesi
 * sendiri otomatis dilewati tanpa error.
 */
export function BulkSessionActions({
  selectedIds,
  onDone,
}: {
  selectedIds: string[];
  onDone: () => void;
}) {
  const { execute, isPending } = useToastAction(bulkRevokeSessionsAction, {
    successMessage:
      selectedIds.length === 1 ? "Sesi dicabut." : `${selectedIds.length} sesi dicabut.`,
    onSuccess: onDone,
  });

  if (selectedIds.length === 0) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
      <span className="text-sm font-medium">
        {selectedIds.length} {selectedIds.length === 1 ? "sesi dipilih" : "sesi dipilih"}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => execute({ sessionIds: selectedIds })}
      >
        <XIcon className="size-4" />
        Cabut
      </Button>
    </div>
  );
}
