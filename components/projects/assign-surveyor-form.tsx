"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { assignSurveyor } from "@/lib/actions/projects";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Admin-only: this component must never be rendered for a surveyor. */
export function AssignSurveyorForm({
  projectId,
  currentSurveyorId,
  surveyors,
}: {
  projectId: string;
  currentSurveyorId: string | null;
  surveyors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [surveyorId, setSurveyorId] = useState(currentSurveyorId ?? "");
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useAction(assignSurveyor);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          aria-label="Assign surveyor"
          className={selectClassName}
          value={surveyorId}
          onChange={(e) => setSurveyorId(e.target.value)}
        >
          <option value="">Belum ditugaskan</option>
          {surveyors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={isExecuting || surveyorId === (currentSurveyorId ?? "")}
          onClick={async () => {
            setError(null);
            const result = await executeAsync({ projectId, surveyorId });
            if (result?.serverError) {
              setError(result.serverError);
              return;
            }
            router.refresh();
          }}
        >
          {isExecuting ? "Menyimpan..." : "Tugaskan"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
