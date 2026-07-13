"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { changeProjectStatus } from "@/lib/actions/projects";
import type { projectStatusEnum } from "@/lib/actions/projects-schemas";
import { statusLabel } from "@/lib/labels";

type ProjectStatus = z.infer<typeof projectStatusEnum>;

/**
 * Allowed callers: admin, or the surveyor assigned to this project.
 *
 * `allowedNextStatuses` (from `getAllowedNextStatuses`, the same transition
 * table `changeProjectStatusForUser` enforces server-side) is what limits
 * the options shown here. This is a UX nicety only — the server is the
 * actual enforcement boundary, so a stale/tampered value here can't grant
 * an illegal transition.
 */
export function StatusChanger({
  projectId,
  currentStatus,
  allowedNextStatuses,
}: {
  projectId: string;
  currentStatus: string;
  allowedNextStatuses: string[];
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<ProjectStatus | "">(
    (allowedNextStatuses[0] as ProjectStatus) ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(changeProjectStatus);

  if (allowedNextStatuses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tidak ada transisi status yang tersedia untuk peran Anda saat ini.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SelectField
          aria-label="Ubah status"
          options={allowedNextStatuses.map((value) => ({
            value,
            label: statusLabel[value] ?? value,
          }))}
          value={nextStatus}
          onValueChange={(value) => setNextStatus(value as ProjectStatus)}
        />
        <Button
          size="sm"
          disabled={isExecuting || !nextStatus || nextStatus === currentStatus}
          onClick={async () => {
            if (!nextStatus) return;
            setError(null);
            const result = await executeAsync({ projectId, toStatus: nextStatus });
            if (result?.serverError) {
              setError(result.serverError);
              return;
            }
            router.refresh();
          }}
        >
          {isExecuting ? "Menyimpan..." : "Ubah status"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
