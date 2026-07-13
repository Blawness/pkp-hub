import Link from "next/link";
import { StatusBadge } from "@/components/projects/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatRelativeDate } from "@/lib/format";
import { surveyTypeLabel } from "@/lib/labels";

/**
 * Satu proyek di feed dashboard. Dipakai admin dan surveyor.
 *
 * Sengaja tidak menerima objek proyek utuh, melainkan field-field lepas: baris
 * ini tampil di dashboard surveyor, dan menerima seluruh baris proyek berarti
 * membuka pintu bagi `projectValue` / `paymentStatus` ikut terserialisasi ke
 * payload surveyor. Batas yang dijaga `dashboard-logic.ts` akan sia-sia kalau
 * lapisan tampilannya justru meminta objek mentah.
 */
export function ProjectRow({
  id,
  title,
  status,
  surveyType,
  clientName,
  surveyorName,
  orderDate,
  needsAction = false,
}: {
  id: string;
  title: string;
  status: string;
  surveyType: string;
  clientName: string;
  surveyorName?: string | null;
  orderDate: Date;
  needsAction?: boolean;
}) {
  return (
    <Link
      href={`/dashboard/projects/${id}`}
      className="group flex items-center gap-4 rounded-lg border border-border p-3 transition-colors hover:border-primary/30 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium group-hover:text-primary">{title}</span>
          {needsAction ? (
            <Badge variant="destructive" className="shrink-0">
              Perlu tindakan
            </Badge>
          ) : null}
        </div>

        {/* Metadata dipisah titik tengah; surveyor yang belum ditugaskan cukup
            dihilangkan, bukan ditampilkan sebagai "—" yang jadi derau. */}
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[
            clientName,
            surveyTypeLabel[surveyType] ?? surveyType,
            surveyorName,
            formatRelativeDate(orderDate),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <StatusBadge status={status} />
    </Link>
  );
}
