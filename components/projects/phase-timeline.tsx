import { ListChecksIcon } from "lucide-react";
import { PhaseCard, type PhaseCardPhase } from "@/components/projects/phase-card";
import { PhaseFormDialog } from "@/components/projects/phase-form-dialog";
import { PhaseReorderButtons } from "@/components/projects/phase-reorder-buttons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { isPhaseLate } from "@/lib/phases/derive";

export type PhaseTimelineItem = PhaseCardPhase & { sortOrder: number };

/**
 * Timeline fase — server-safe (tanpa hook), dipakai baik di dashboard admin
 * maupun di portal klien. Portal memanggilnya dengan `canEditPlan={false}
 * canReportWork={false}`, yang menyembunyikan SELURUH tombol kelola; itu
 * kenyamanan UI saja, penolakan sungguhannya ada di `phases-logic.ts`.
 *
 * `progress === null` (proyek belum punya fase) TIDAK PERNAH dirender sebagai
 * "0%" — itu klaim palsu bahwa timeline-nya ada tapi kosong.
 */
export function PhaseTimeline({
  projectId,
  phases,
  progress,
  today,
  canEditPlan,
  canReportWork,
  surveyors,
}: {
  projectId: string;
  phases: PhaseTimelineItem[];
  progress: number | null;
  today: string;
  canEditPlan: boolean;
  canReportWork: boolean;
  surveyors: { id: string; name: string }[];
}) {
  const sorted = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const orderedIds = sorted.map((p) => p.id);
  const doneCount = sorted.filter((p) => p.status === "selesai").length;
  const surveyorNameById = new Map(surveyors.map((s) => [s.id, s.name]));

  if (sorted.length === 0) {
    return (
      <EmptyState
        icon={ListChecksIcon}
        title="Belum ada fase"
        description={
          canEditPlan
            ? "Tambahkan fase pertama untuk mulai melacak progres proyek ini."
            : "Studio belum menyusun timeline untuk proyek ini."
        }
        action={
          canEditPlan ? (
            <PhaseFormDialog
              projectId={projectId}
              surveyors={surveyors}
              trigger={<Button>Tambah fase pertama</Button>}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {doneCount} dari {sorted.length} fase selesai
            {progress !== null ? ` · ${progress}%` : ""}
          </p>
          {canEditPlan ? (
            <PhaseFormDialog
              projectId={projectId}
              surveyors={surveyors}
              trigger={
                <Button size="sm" variant="outline">
                  Tambah fase
                </Button>
              }
            />
          ) : null}
        </div>
        {progress !== null ? (
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {sorted.map((phase, index) => (
          <PhaseCard
            key={phase.id}
            phase={phase}
            late={isPhaseLate(phase, today)}
            canEditPlan={canEditPlan}
            canReportWork={canReportWork}
            projectId={projectId}
            surveyorName={
              phase.assignedSurveyorId
                ? (surveyorNameById.get(phase.assignedSurveyorId) ?? "—")
                : null
            }
            surveyors={surveyors}
            reorder={
              canEditPlan ? (
                <PhaseReorderButtons
                  projectId={projectId}
                  orderedPhaseIds={orderedIds}
                  index={index}
                />
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
