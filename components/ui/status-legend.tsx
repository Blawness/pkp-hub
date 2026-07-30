import { Card, CardContent, CardHeader, CardTitle } from "./card"
import { projectStatusOrder, statusLabel } from "@/lib/labels"
import type { ProjectStatus } from "@/lib/actions/projects-logic"
import {
  ClipboardListIcon,
  CalendarIcon,
  BarChart3Icon,
  Settings2Icon,
  CheckCircleIcon,
  XCircleIcon,
} from "lucide-react"

const statusIcons: Record<ProjectStatus, React.ReactNode> = {
  baru: <ClipboardListIcon className="size-4" aria-hidden />,
  dijadwalkan: <CalendarIcon className="size-4" aria-hidden />,
  data_diambil: <BarChart3Icon className="size-4" aria-hidden />,
  diproses: <Settings2Icon className="size-4" aria-hidden />,
  selesai: <CheckCircleIcon className="size-4" aria-hidden />,
  dibatalkan: <XCircleIcon className="size-4" aria-hidden />,
}

/**
 * Visual reference card showing all project statuses with icons.
 * Useful for helping users understand the status pipeline.
 */
export function StatusLegend() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status Proyek</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {projectStatusOrder.map((status) => (
            <div
              key={status}
              className="flex items-center gap-3 text-sm py-1.5"
            >
              <div className="flex items-center justify-center w-5 h-5 text-muted-foreground">
                {statusIcons[status]}
              </div>
              <span className="text-muted-foreground flex-1">
                {statusLabel[status]}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
