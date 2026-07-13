import { statusLabel } from "@/lib/labels";
import { toneFor } from "@/lib/status-color";
import { cn } from "@/lib/utils";

/**
 * Lencana status proyek. Bukan varian <Badge> biasa karena warnanya bergantung
 * pada nilai status, dan pemetaan itu tinggal di `lib/status-color.ts` supaya
 * tabel, dashboard, dan halaman detail tidak pernah menampilkan warna berbeda
 * untuk status yang sama.
 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = toneFor(status);

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        tone.badge,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.fill)} />
      {statusLabel[status] ?? status}
    </span>
  );
}
