import { AlertTriangleIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { OverduePhasesData } from "@/lib/actions/dashboard-logic";

/**
 * Kartu "Perangkat jatuh tempo" di dashboard admin. Server component murni:
 * tidak ada state, tidak ada fetch — data sudah disediakan
 * `getOverduePhasesForUser(ctx)`. Pemanggil (`app/dashboard/page.tsx`)
 * memutuskan apakah akan merender kartu ini sama sekali (ia tidak dirender
 * untuk surveyor, dan disembunyikan kalau `getOverduePhasesForUser` mengembalikan
 * `null`).
 *
 * TUJUAN: menggantikan ritual WhatsApp harian "siapa yang telat?" dengan satu
 * kartu yang bisa di-scan dalam 10 detik. Klik judul proyek lompat ke tab Fase
 * proyek itu; klik nama fase (kalau ditambahkan nanti) bisa lompat ke fase.
 */

/** Baris untuk satu fase lewat tempo. */
function PhaseRow({
  href,
  projectTitle,
  clientName,
  phaseName,
  surveyorName,
  targetDate,
  days,
  tone,
}: {
  href: string;
  projectTitle: string;
  clientName: string | null;
  phaseName: string;
  surveyorName: string | null;
  targetDate: string;
  days: number;
  tone: "overdue" | "due-soon";
}) {
  const daysLabel = tone === "overdue" ? `Telat ${Math.abs(days)} hari` : `${days} hari lagi`;
  const daysClasses =
    tone === "overdue"
      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/60 px-3 py-2 text-sm">
      <Link
        href={href}
        className="font-medium transition-colors hover:text-primary hover:underline"
      >
        {projectTitle}
      </Link>
      <span className="text-muted-foreground">·</span>
      <span className="min-w-0 truncate">{phaseName}</span>
      {clientName ? <span className="text-xs text-muted-foreground">({clientName})</span> : null}
      <span className="ml-auto flex items-center gap-2 text-xs">
        {surveyorName ? <span className="text-muted-foreground">PJ: {surveyorName}</span> : null}
        <span className="text-muted-foreground">Target {targetDate}</span>
        {/* Hari label dibaca apa adanya oleh screen reader — `aria-label`
            pada `<span>` tanpa role ditolak Biome. Teks `Telat 3 hari` /
            `4 hari lagi` sudah lengkap tanpa label tambahan. */}
        <span className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${daysClasses}`}>
          {daysLabel}
        </span>
      </span>
    </li>
  );
}

export function OverduePhasesCard({ data }: { data: OverduePhasesData }) {
  const totalCount = data.overdueCount + data.dueSoonCount;
  const showEmpty = totalCount === 0;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          {data.overdueCount > 0 ? (
            <AlertTriangleIcon className="size-4 text-red-600 dark:text-red-400" aria-hidden />
          ) : (
            <ClockIcon className="size-4 text-muted-foreground" aria-hidden />
          )}
          Perangkat jatuh tempo
        </CardTitle>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${
              data.overdueCount > 0
                ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {data.overdueCount} telat
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-medium tabular-nums ${
              data.dueSoonCount > 0
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {data.dueSoonCount} ≤ 7 hari
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {showEmpty ? (
          <EmptyState
            icon={ClockIcon}
            title="Tidak ada fase yang jatuh tempo"
            description="Belum ada fase aktif dengan tanggal target dalam 7 hari ke depan. 🎉"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {data.overdue.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-400">
                  Lewat tempo
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {data.overdue.map((p) => (
                    <PhaseRow
                      key={p.phaseId}
                      href={`/dashboard/projects/${p.projectId}#phase-${p.phaseId}`}
                      projectTitle={p.projectTitle}
                      clientName={p.clientName}
                      phaseName={p.phaseName}
                      surveyorName={p.surveyorName}
                      targetDate={p.targetDate}
                      days={p.daysUntilTarget}
                      tone="overdue"
                    />
                  ))}
                </ul>
                {data.overdueCount > data.overdue.length ? (
                  <p className="text-xs text-muted-foreground">
                    +{data.overdueCount - data.overdue.length} lainnya — buka tab Fase per proyek.
                  </p>
                ) : null}
              </section>
            ) : null}
            {data.dueSoon.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  Akan jatuh tempo
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {data.dueSoon.map((p) => (
                    <PhaseRow
                      key={p.phaseId}
                      href={`/dashboard/projects/${p.projectId}#phase-${p.phaseId}`}
                      projectTitle={p.projectTitle}
                      clientName={p.clientName}
                      phaseName={p.phaseName}
                      surveyorName={p.surveyorName}
                      targetDate={p.targetDate}
                      days={p.daysUntilTarget}
                      tone="due-soon"
                    />
                  ))}
                </ul>
                {data.dueSoonCount > data.dueSoon.length ? (
                  <p className="text-xs text-muted-foreground">
                    +{data.dueSoonCount - data.dueSoon.length} lainnya.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
