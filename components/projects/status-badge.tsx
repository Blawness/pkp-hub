import { statusLabel } from "@/lib/labels"
import type { ProjectStatus } from "@/lib/actions/projects-logic"
import { toneFor } from "@/lib/status-color"
import { cn } from "@/lib/utils"
import {
  ClipboardListIcon,
  CalendarIcon,
  BarChart3Icon,
  Settings2Icon,
  CheckCircleIcon,
  XCircleIcon,
} from "lucide-react"

/**
 * Lencana status proyek dengan icon. Warnanya bergantung pada nilai status,
 * dan pemetaan itu tinggal di `lib/status-color.ts` supaya tabel, dashboard,
 * dan halaman detail tidak pernah menampilkan warna berbeda untuk status yang sama.
 *
 * Variants:
 * - `default`: Icon + label (full display)
 * - `compact`: Just icon (for tight spaces)
 * - `text-only`: Label only (for breadcrumbs)
 */

const statusIconMap: Record<ProjectStatus, React.ReactNode> = {
  baru: <ClipboardListIcon className="size-4" aria-hidden />,
  dijadwalkan: <CalendarIcon className="size-4" aria-hidden />,
  data_diambil: <BarChart3Icon className="size-4" aria-hidden />,
  diproses: <Settings2Icon className="size-4" aria-hidden />,
  selesai: <CheckCircleIcon className="size-4" aria-hidden />,
  dibatalkan: <XCircleIcon className="size-4" aria-hidden />,
}

export function StatusBadge({
  status,
  variant = "default",
  className,
}: {
  status: string
  variant?: "default" | "compact" | "text-only"
  className?: string
}) {
  const tone = toneFor(status)
  const label = statusLabel[status] ?? status
  const icon = statusIconMap[status as ProjectStatus]

  if (variant === "text-only") {
    return <span className={cn("text-sm", className)}>{label}</span>
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "inline-flex h-6 w-6 items-center justify-center rounded-md",
          tone.badge,
          className
        )}
        title={label}
        aria-label={label}
      >
        {icon}
      </div>
    )
  }

  // default variant: icon + label with dot
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        tone.badge,
        className
      )}
      aria-label={label}
    >
      {icon}
      {label}
    </span>
  )
}

/**
 * Dot indicator — just the colored circle (for tables, pipelines).
 * Useful when space is tight.
 */
export function StatusDot({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const tone = toneFor(status)
  const label = statusLabel[status] ?? status

  return (
    <div
      className={cn("h-2 w-2 rounded-full", tone.fill)}
      title={label}
      aria-label={label}
    />
  )
}
