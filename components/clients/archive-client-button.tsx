"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { archiveClient } from "@/lib/actions/clients";
import { useToastAction } from "@/lib/hooks/use-toast-action";

export function ArchiveClientButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useToastAction(archiveClient, {
    successMessage: "Klien diarsipkan.",
  });

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
