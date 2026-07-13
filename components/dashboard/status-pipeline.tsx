import Link from "next/link";
import { projectStatusOrder, statusLabel } from "@/lib/labels";
import { toneFor } from "@/lib/status-color";
import { cn } from "@/lib/utils";

/**
 * Sebaran proyek per status, sebagai SATU kartu.
 *
 * Sebelumnya tiap status jadi kartunya sendiri di grid yang sama dengan kartu
 * uang, jadi jumlah kartu ikut berubah tergantung berapa status yang kebetulan
 * terpakai — itulah kenapa grid-nya terasa acak. Sebagai satu baris, sebaran
 * ini juga akhirnya bisa dibandingkan: sekali lihat ketahuan proyek menumpuk
 * di tahap mana.
 *
 * Urutannya mengikuti `projectStatusOrder` (alur kerja), bukan urutan kunci
 * objek dari database — yang tidak dijamin dan bisa berubah.
 */
export function StatusPipeline({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const segments = projectStatusOrder
    .map((status) => ({ status, count: counts[status] ?? 0 }))
    .filter((s) => s.count > 0);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">Belum ada proyek untuk dipetakan ke tahapan.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Batang proporsional. `flex-grow` sesuai jumlah, dengan basis minimum
          supaya status berisi 1 proyek tetap terlihat, bukan jadi sehelai
          rambut yang tak bisa diklik. */}
      <div className="flex h-2 gap-1 overflow-hidden rounded-full">
        {segments.map(({ status, count }) => (
          <div
            key={status}
            className={cn("min-w-1.5 rounded-full", toneFor(status).fill)}
            style={{ flexGrow: count }}
          />
        ))}
      </div>

      <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {segments.map(({ status, count }) => (
          <li key={status}>
            <Link
              href={`/dashboard/projects?status=${status}`}
              className="group flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span aria-hidden className={cn("size-2 rounded-full", toneFor(status).fill)} />
              <span className="truncate text-muted-foreground group-hover:text-foreground">
                {statusLabel[status] ?? status}
              </span>
              <span className="ml-auto font-medium tabular-nums">{count}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
