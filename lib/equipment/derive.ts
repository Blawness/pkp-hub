/**
 * Fungsi murni di balik inventaris alat (spec 2026-07-14). Tidak menyentuh DB —
 * aturan pinjamnya bisa diuji tanpa fixture apa pun.
 */

export type EquipmentCondition = "tersedia" | "perawatan" | "rusak" | "pensiun";

const conditionRejection: Record<Exclude<EquipmentCondition, "tersedia">, string> = {
  perawatan: "Alat sedang dalam perawatan.",
  rusak: "Alat berstatus rusak.",
  pensiun: "Alat sudah dipensiunkan.",
};

/** `now` di-inject — jangan panggil `Date.now()` di sini, test jadi flaky. */
export function usageDurationMs(
  session: { startedAt: Date; endedAt: Date | null },
  now: Date,
): number {
  const end = session.endedAt ?? now;
  return end.getTime() - session.startedAt.getTime();
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

/**
 * Boleh dipinjam? Mengembalikan PESAN penolakan, atau null kalau boleh.
 *
 * `hasActiveSession` datang dari DB, tapi keputusannya di sini supaya bisa diuji
 * murni. Ingat: pertahanan sungguhan terhadap sesi ganda adalah partial unique
 * index di `equipment_usage` — fungsi ini hanya memberi pesan yang enak dibaca
 * sebelum database sempat menolak.
 */
export function borrowRejection(
  item: { condition: EquipmentCondition; archivedAt: Date | null },
  hasActiveSession: boolean,
): string | null {
  if (item.archivedAt) return "Alat sudah diarsipkan.";
  if (item.condition !== "tersedia") return conditionRejection[item.condition];
  if (hasActiveSession) return "Alat sedang dipakai orang lain.";
  return null;
}

/** Mengembalikan PESAN penolakan, atau null kalau jendela waktunya sah. */
export function validateUsageWindow(
  startedAt: Date,
  endedAt: Date | null,
  now: Date,
): string | null {
  // Mundur BOLEH (untuk yang lupa menekan tombol); maju TIDAK — itu booking,
  // dan booking bukan cakupan modul ini.
  if (startedAt.getTime() > now.getTime()) {
    return "Waktu mulai tidak boleh di masa depan.";
  }
  if (endedAt && endedAt.getTime() <= startedAt.getTime()) {
    return "Waktu selesai harus setelah waktu mulai.";
  }
  return null;
}

/**
 * Agregat tersedia/dipinjam/perawatan/rusak untuk sekumpulan unit — dipakai
 * baik untuk ringkasan total (semua unit lintas item) maupun ringkasan per
 * item (spec 2026-07-16). Sesi aktif MENIMPA `condition`: unit yang sedang
 * dipinjam dihitung "terpinjam" walau `condition`-nya "tersedia".
 */
export function summarizeUnits(units: { condition: EquipmentCondition; activeUsage: unknown }[]): {
  total: number;
  tersedia: number;
  terpinjam: number;
  perawatan: number;
  rusak: number;
} {
  return {
    total: units.length,
    tersedia: units.filter((u) => !u.activeUsage && u.condition === "tersedia").length,
    terpinjam: units.filter((u) => Boolean(u.activeUsage)).length,
    perawatan: units.filter((u) => !u.activeUsage && u.condition === "perawatan").length,
    rusak: units.filter((u) => !u.activeUsage && u.condition === "rusak").length,
  };
}

/**
 * Satu badge status ringkas untuk kartu galeri (spec 2026-07-22). Diturunkan
 * dari agregat `summarizeUnits` — bukan kolom tersimpan. Prioritas: ada yang
 * bisa dipinjam dulu, lalu "semua dipinjam", lalu tidak tersedia (perawatan/
 * rusak/kosong).
 */
export function equipmentStockBadge(summary: {
  total: number;
  tersedia: number;
  terpinjam: number;
  perawatan: number;
  rusak: number;
}): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (summary.tersedia > 0) {
    return { label: `${summary.tersedia} tersedia`, variant: "secondary" };
  }
  if (summary.terpinjam > 0) {
    return { label: "Semua dipinjam", variant: "default" };
  }
  return { label: "Tidak tersedia", variant: "outline" };
}
