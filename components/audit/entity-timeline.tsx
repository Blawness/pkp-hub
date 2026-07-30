import type { AuditLogRow } from "@/lib/actions/audit-logic";
import { actionBadge } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/ui/relative-time";

function detailSummary(detail: Record<string, unknown> | null): string {
  if (!detail) return "—";
  const entries = Object.entries(detail).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
}

/**
 * Timeline audit kompak untuk satu entitas — tanpa pagination (last N
 * entry). Dipakai sebagai tab "Riwayat" di detail proyek & klien.
 * Server component — tidak ada interaktivitas, render murni HTML.
 */
export function EntityTimeline({
  rows,
  maxRows = 30,
}: {
  rows: AuditLogRow[];
  maxRows?: number;
}) {
  const shown = rows.slice(0, maxRows);

  if (shown.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground text-sm">
        Belum ada riwayat aktivitas untuk entitas ini.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Waktu</th>
            <th className="px-3 py-2 text-left font-medium">Oleh</th>
            <th className="px-3 py-2 text-left font-medium">Aksi</th>
            <th className="px-3 py-2 text-left font-medium">Detail</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">
                <RelativeTime date={row.createdAt} />
              </td>
              <td className="px-3 py-2 text-xs">{row.actorName ?? "—"}</td>
              <td className="px-3 py-2">
                <span
                  className={cn(
                    "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                    actionBadge[row.action] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {row.action}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs max-w-[16rem] truncate">
                {detailSummary(row.detail)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
