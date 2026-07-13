"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { deleteDocument } from "@/lib/actions/documents";

/** Admin-only control — never render this for a non-admin. */
export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const router = useRouter();
  const { executeAsync, isExecuting } = useAction(deleteDocument);

  return (
    <Button
      variant="destructive"
      size="icon-sm"
      disabled={isExecuting}
      onClick={async () => {
        if (!window.confirm("Hapus dokumen ini? Tindakan ini tidak dapat dibatalkan.")) return;
        const result = await executeAsync({ id: documentId });
        if (!result?.serverError) router.refresh();
      }}
      aria-label="Hapus dokumen"
    >
      <Trash2Icon />
    </Button>
  );
}
