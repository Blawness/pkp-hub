"use client";

import { PencilIcon } from "lucide-react";
import { AssignSurveyorForm } from "@/components/projects/assign-surveyor-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Admin-only: tombol kecil "Ubah" di sebelah nama surveyor → dialog assign. */
export function SurveyorAssignDialog({
  projectId,
  currentSurveyorId,
  surveyors,
}: {
  projectId: string;
  currentSurveyorId: string | null;
  surveyors: { id: string; name: string }[];
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
            <PencilIcon className="size-3" />
            Ubah
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign surveyor</DialogTitle>
        </DialogHeader>
        <AssignSurveyorForm
          projectId={projectId}
          currentSurveyorId={currentSurveyorId}
          surveyors={surveyors}
        />
      </DialogContent>
    </Dialog>
  );
}
