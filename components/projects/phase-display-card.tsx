"use client";

import {
  AlertCircleIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  PlayCircleIcon,
  UserIcon,
} from "lucide-react";
import { phaseStatusLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

type PhaseStatus = "belum" | "berjalan" | "selesai";

type PhaseDisplayCardProps = {
  id: string;
  name: string;
  status: PhaseStatus;
  weight: number;
  targetDate?: string | null;
  description?: string | null;
  assignedSurveyor?: { name: string } | null;
  totalWeight: number;
};

const phaseStatusIcons: Record<PhaseStatus, React.ReactNode> = {
  belum: <ClockIcon className="size-4" aria-hidden />,
  berjalan: <PlayCircleIcon className="size-4" aria-hidden />,
  selesai: <CheckCircleIcon className="size-4" aria-hidden />,
};

const phaseStatusColors: Record<PhaseStatus, string> = {
  belum: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  berjalan: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  selesai: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/**
 * Calculate days until target date (negative = overdue)
 */
function daysUntilTarget(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;

  const target = new Date(targetDate);
  const today = new Date();
  // Reset time to compare dates only
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Format date for display (e.g., "15 Jan 2025")
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Phase display card — read-only visualization for project progress.
 * Shows status, weight, target date, surveyor info.
 * Use this for displaying phases in project summary, not for editing (use PhaseCard for that).
 */
export function PhaseDisplayCard({
  name,
  status,
  weight,
  targetDate,
  description,
  assignedSurveyor,
  totalWeight,
}: PhaseDisplayCardProps) {
  const daysRemaining = daysUntilTarget(targetDate);
  const isOverdue = daysRemaining !== null && daysRemaining < 0 && status !== "selesai";
  const isDueToday = daysRemaining !== null && daysRemaining === 0 && status !== "selesai";
  const weightPercent = ((weight / totalWeight) * 100).toFixed(0);

  return (
    <div className="rounded-lg border p-4 space-y-3 hover:shadow-md hover:border-ring/50 transition-all">
      {/* Header: Phase name + Status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm leading-snug">{name}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
          )}
        </div>

        <div
          className={cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium shrink-0",
            phaseStatusColors[status],
          )}
        >
          {phaseStatusIcons[status]}
          <span>{phaseStatusLabel[status]}</span>
        </div>
      </div>

      {/* Surveyor info */}
      {assignedSurveyor && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <UserIcon className="size-3.5" aria-hidden />
          <span>{assignedSurveyor.name}</span>
        </div>
      )}

      {/* Weight indicator */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          Bobot: {weight}/{totalWeight}
        </span>
        <span className="font-medium text-foreground">{weightPercent}%</span>
      </div>

      {/* Target date with overdue/due-today indicator */}
      {targetDate && (
        <div
          className={cn(
            "flex items-center gap-2 text-xs p-2 rounded-md",
            isOverdue
              ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
              : isDueToday
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                : "bg-muted/50 text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-3.5" aria-hidden />
          <span>{formatDate(targetDate)}</span>
          {daysRemaining !== null && (
            <span className="ml-auto font-semibold">
              {isOverdue && `Telat ${Math.abs(daysRemaining)} hari`}
              {isDueToday && "Hari ini"}
              {!isOverdue && !isDueToday && daysRemaining >= 0 && `${daysRemaining}d lagi`}
            </span>
          )}
          {isOverdue && <AlertCircleIcon className="size-3.5" aria-hidden />}
        </div>
      )}
    </div>
  );
}
