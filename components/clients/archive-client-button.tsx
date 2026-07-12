"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { archiveClient } from "@/lib/actions/clients";

export function ArchiveClientButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(archiveClient);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="destructive"
        disabled={isExecuting}
        onClick={async () => {
          setError(null);
          const result = await executeAsync({ id: clientId });
          if (result?.serverError) {
            setError(result.serverError);
            return;
          }
          router.refresh();
        }}
      >
        {isExecuting ? "Mengarsipkan..." : "Arsipkan"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
