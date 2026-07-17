"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { type ReactNode, useState } from "react";
import { PhaseFormDialog } from "@/components/projects/phase-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { deletePhase, setPhaseStatus, updatePhaseNote } from "@/lib/actions/phases";
import { phaseStatusLabel } from "@/lib/labels";
import type { PhaseStatus } from "@/lib/phases/derive";

export type PhaseCardPhase = {
  id: string;
  name: string;
  status: PhaseStatus;
  targetDate: string | null;
  completedAt: Date | null;
  description?: string | null;
  weight?: number;
  assignedSurveyorId?: string | null;
};

/**
 * Kartu satu fase. `canEditPlan` (admin) membuka edit/hapus/susun; `canReportWork`
 * (admin|surveyor) membuka ubah status + catatan. Klien/portal (kedua flag
 * `false`) hanya melihat: nama, status, target, penanda telat.
 */
export function PhaseCard({
  phase,
  late,
  canEditPlan,
  canReportWork,
  projectId,
  surveyorName,
  surveyors,
  reorder,
}: {
  phase: PhaseCardPhase;
  late: boolean;
  canEditPlan: boolean;
  canReportWork: boolean;
  projectId: string;
  surveyorName: string | null;
  surveyors: { id: string; name: string }[];
  reorder?: ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<PhaseStatus>(phase.status);
  const [note, setNote] = useState(phase.description ?? "");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const { executeAsync: executeStatus, isExecuting: isSavingStatus } = useAction(setPhaseStatus);
  const { executeAsync: executeNote, isExecuting: isSavingNote } = useAction(updatePhaseNote);
  const { executeAsync: executeDelete, isExecuting: isDeleting } = useAction(deletePhase);

  async function saveStatus(next: PhaseStatus) {
    setStatus(next);
    setStatusError(null);
    const result = await executeStatus({ phaseId: phase.id, status: next });
    if (result?.serverError) {
      setStatus(phase.status);
      setStatusError(result.serverError);
      return;
    }
    router.refresh();
  }

  async function saveNote() {
    setNoteError(null);
    const result = await executeNote({ phaseId: phase.id, description: note });
    if (result?.serverError) {
      setNoteError(result.serverError);
      return;
    }
    router.refresh();
  }

  async function remove(): Promise<{ error?: string } | undefined> {
    const result = await executeDelete({ phaseId: phase.id });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{phase.name}</p>
              {late ? <Badge variant="destructive">Telat</Badge> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {phase.targetDate ? <span>Target: {phase.targetDate}</span> : null}
              {typeof phase.weight === "number" ? <span>Bobot: {phase.weight}</span> : null}
              {surveyorName ? <span>PJ: {surveyorName}</span> : null}
            </div>
          </div>

          {canEditPlan ? (
            <div className="flex items-center gap-1">
              {reorder}
              <PhaseFormDialog
                projectId={projectId}
                surveyors={surveyors}
                editing={{
                  phaseId: phase.id,
                  name: phase.name,
                  description: phase.description ?? null,
                  weight: phase.weight ?? 1,
                  assignedSurveyorId: phase.assignedSurveyorId ?? null,
                  targetDate: phase.targetDate,
                }}
                trigger={
                  <Button variant="outline" size="sm">
                    Ubah
                  </Button>
                }
              />
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm" disabled={isDeleting}>
                    Hapus
                  </Button>
                }
                title="Hapus fase?"
                description={`"${phase.name}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
                confirmLabel="Hapus"
                confirmVariant="destructive"
                onConfirm={remove}
              />
            </div>
          ) : null}
        </div>

        {canReportWork ? (
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <SelectField
              aria-label={`Status fase ${phase.name}`}
              options={optionsFromLabels(phaseStatusLabel)}
              value={status}
              onValueChange={(value) => saveStatus(value as PhaseStatus)}
              disabled={isSavingStatus}
            />
            {statusError ? <p className="text-xs text-destructive">{statusError}</p> : null}
          </div>
        ) : (
          <Badge variant="secondary" className="w-fit">
            {phaseStatusLabel[phase.status] ?? phase.status}
          </Badge>
        )}

        {canReportWork ? (
          <div className="flex flex-col gap-1.5">
            <Textarea
              rows={2}
              placeholder="Catatan internal (tidak terlihat klien)."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSavingNote || note === (phase.description ?? "")}
                onClick={saveNote}
              >
                {isSavingNote ? "Menyimpan..." : "Simpan catatan"}
              </Button>
              {noteError ? <p className="text-xs text-destructive">{noteError}</p> : null}
            </div>
          </div>
        ) : phase.description ? (
          <p className="text-sm text-muted-foreground">{phase.description}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
