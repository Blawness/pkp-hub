"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteDocument } from "@/lib/actions/documents";

/** Admin-only control — never render this for a non-admin. */
export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const { executeAsync, isExecuting } = useAction(deleteDocument);

  async function handleDelete(): Promise<{ error?: string } | undefined> {
    const result = await executeAsync({ id: documentId });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  return (
    <ConfirmDialog
      trigger={
        <Button
          variant="destructive"
          size="icon-sm"
          disabled={isExecuting}
          aria-label="Hapus dokumen"
        >
          <Trash2Icon />
        </Button>
      }
      title="Hapus dokumen?"
      description="Dokumen dan filenya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan."
      confirmLabel="Hapus"
      confirmVariant="destructive"
      onConfirm={handleDelete}
    />
  );
}
