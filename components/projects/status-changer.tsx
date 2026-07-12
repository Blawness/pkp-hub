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

/** Allowed callers: owner, or the surveyor assigned to this project. */
export function StatusChanger({
  projectId,
  currentStatus,
}: {
  projectId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [nextStatus, setNextStatus] = useState<ProjectStatus>(currentStatus as ProjectStatus);
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(changeProjectStatus);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Ubah status"
          className={selectClassName}
          value={nextStatus}
          onChange={(e) => setNextStatus(e.target.value as ProjectStatus)}
        >
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={isExecuting || nextStatus === currentStatus}
          onClick={async () => {
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
