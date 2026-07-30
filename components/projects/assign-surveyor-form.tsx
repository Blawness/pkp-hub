"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectOption } from "@/components/ui/select-field";
import { assignSurveyor } from "@/lib/actions/projects";
import { useToastAction } from "@/lib/hooks/use-toast-action";

/** Admin-only: this component must never be rendered for a surveyor. */
export function AssignSurveyorForm({
  projectId,
  currentSurveyorId,
  surveyors,
  onSuccess,
}: {
  projectId: string;
  currentSurveyorId: string | null;
  surveyors: { id: string; name: string }[];
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [surveyorId, setSurveyorId] = useState(currentSurveyorId ?? "");
  const [error, setError] = useState<string | null>(null);
  const { executeAsync, isExecuting } = useToastAction(assignSurveyor);

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
            onSuccess?.();
          }}
        >
          {isExecuting ? "Menyimpan..." : "Tugaskan"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
