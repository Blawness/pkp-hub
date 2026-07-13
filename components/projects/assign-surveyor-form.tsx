"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { assignSurveyor } from "@/lib/actions/projects";

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

  const options: SelectOption[] = [
    { value: "", label: "Belum ditugaskan" },
    ...surveyors.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <SelectField
          aria-label="Assign surveyor"
          options={options}
          value={surveyorId}
          onValueChange={setSurveyorId}
        />
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
