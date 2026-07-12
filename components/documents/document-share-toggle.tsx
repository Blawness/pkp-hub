"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { toggleDocumentShare } from "@/lib/actions/documents";

/** Owner-only control — never render this for a non-owner. Optimistic UI. */
export function DocumentShareToggle({
  documentId,
  sharedWithClient,
}: {
  documentId: string;
  sharedWithClient: boolean;
}) {
  const router = useRouter();
  const [optimistic, setOptimistic] = useState(sharedWithClient);
  const { executeAsync, isExecuting } = useAction(toggleDocumentShare);

  return (
    <button
      type="button"
      disabled={isExecuting}
      onClick={async () => {
        const next = !optimistic;
        setOptimistic(next);
        const result = await executeAsync({ id: documentId, sharedWithClient: next });
        if (result?.serverError) {
          setOptimistic(!next);
          return;
        }
        router.refresh();
      }}
      className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Badge variant={optimistic ? "default" : "secondary"}>
        {optimistic ? "Dibagikan" : "Privat"}
      </Badge>
    </button>
  );
}
