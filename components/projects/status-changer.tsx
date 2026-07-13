"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { changeProjectStatus } from "@/lib/actions/projects";
import type { projectStatusEnum } from "@/lib/actions/projects-schemas";
import { statusLabel } from "@/lib/labels";

type ProjectStatus = z.infer<typeof projectStatusEnum>;

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

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
        <select
          aria-label="Ubah status"
          className={selectClassName}
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as ProjectStatus)}
        >
          {allowedNextStatuses.map((value) => (
            <option key={value} value={value}>
              {statusLabel[value] ?? value}
            </option>
          ))}
        </select>
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
