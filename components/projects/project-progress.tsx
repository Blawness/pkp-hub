type ProjectPhaseStatus = "belum" | "berjalan" | "selesai";

/**
 * Calculate project progress percentage from phases.
 * Progress = (sum of weights of completed phases) / (total weight)
 * Returns 0 if no phases, or if total weight is 0.
 */
export function calculateProgress(
  phases: Array<{ weight: number; status: ProjectPhaseStatus }>,
): number {
  if (phases.length === 0) return 0;

  const totalWeight = phases.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return 0;

  const completedWeight = phases
    .filter((p) => p.status === "selesai")
    .reduce((sum, p) => sum + p.weight, 0);

  return Math.round((completedWeight / totalWeight) * 100);
}

/**
 * Project progress bar component.
 * Shows visual progress + percentage label.
 */
export function ProjectProgress({
  progress,
  showLabel = true,
}: {
  progress: number;
  showLabel?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-semibold">Progres Proyek</span>
        {showLabel && <span className="font-bold text-primary">{progress}%</span>}
      </div>
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div
          className="bg-primary rounded-full h-2 transition-all duration-500"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Project progress: ${progress}%`}
        />
      </div>
    </div>
  );
}

/**
 * Empty state for phases (when no phases exist).
 */
export function PhasesEmpty() {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center">
      <p className="text-sm text-muted-foreground">Belum ada fase untuk proyek ini.</p>
      <p className="text-xs text-muted-foreground mt-1">Tambahkan fase untuk melacak kemajuan.</p>
    </div>
  );
}
