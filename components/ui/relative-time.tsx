"use client";

import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function absoluteDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function relativeLabel(date: Date, now: Date): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 10) return "baru saja";
  if (diffSec < 60) return `${diffSec} dtk lalu`;
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  if (diffHour < 24) return `${diffHour} jam lalu`;
  if (diffDay < 7) return `${diffDay} hari lalu`;
  if (diffWeek < 5) return `${diffWeek} mgg lalu`;
  if (diffMonth < 12) return `${diffMonth} bln lalu`;
  return `${diffYear} thn lalu`;
}

/** Interval refresh relatif (ms) — cukup 60 detik untuk akurasi "beberapa menit". */
const TICK_MS = 60_000;

/**
 * Menampilkan waktu relatif ("5 mnt lalu") dengan tooltip absolut
 * (format Indonesia lengkap). Diperbarui otomatis tiap 60 detik.
 */
export function RelativeTime({ date }: { date: Date }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger>
        <time dateTime={date.toISOString()} className="text-muted-foreground text-xs whitespace-nowrap">
          {relativeLabel(date, now)}
        </time>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{absoluteDate(date)}</p>
      </TooltipContent>
    </Tooltip>
  );
}
