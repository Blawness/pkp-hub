/**
 * Fungsi murni di balik timeline fase (spec 2026-07-14). Tidak menyentuh DB —
 * aturan progresnya bisa diuji tanpa fixture apa pun.
 */

export type PhaseStatus = "belum" | "berjalan" | "selesai";

export type PhaseProgressInput = { status: PhaseStatus; weight: number };

/**
 * Persen progres proyek. SATU-SATUNYA tempat yang memutuskan angka ini — ia
 * kolom turunan, bukan isian.
 *
 * Mengembalikan `null` (bukan 0) untuk proyek tanpa fase atau yang total
 * bobotnya 0: "belum pakai timeline" berbeda dari "0% dikerjakan", dan UI harus
 * bisa membedakannya.
 */
export function calculateProgress(phases: PhaseProgressInput[]): number | null {
  const total = phases.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return null;

  const done = phases.filter((p) => p.status === "selesai").reduce((sum, p) => sum + p.weight, 0);

  return Math.round((done / total) * 100);
}

/** `today` di-inject (`YYYY-MM-DD`) — jangan panggil `new Date()` di sini, test jadi flaky. */
export function isPhaseLate(
  phase: { targetDate: string | null; status: PhaseStatus },
  today: string,
): boolean {
  if (!phase.targetDate) return false;
  if (phase.status === "selesai") return false;
  return phase.targetDate < today;
}

export function nextSortOrder(existing: { sortOrder: number }[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((p) => p.sortOrder)) + 1;
}

/**
 * Susun ulang = tulis ULANG seluruh urutan jadi 0..n-1, bukan menukar dua baris.
 * Menukar dua baris meninggalkan celah/kembar kalau ada dua aksi bersamaan.
 */
export function resequence(orderedIds: string[]): { id: string; sortOrder: number }[] {
  return orderedIds.map((id, i) => ({ id, sortOrder: i }));
}

/**
 * Tanggal hari ini DI JAKARTA (`YYYY-MM-DD`), bukan di UTC.
 *
 * `targetDate` adalah tanggal kalender Indonesia. Server berjalan UTC, jadi
 * `now.toISOString().slice(0, 10)` akan salah sehari untuk sepanjang jam 00:00-
 * 07:00 WIB — dan penanda "Telat" ikut salah sehari. `en-CA` dipilih karena ia
 * memformat sebagai `YYYY-MM-DD`.
 */
export function todayString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `completedAt` diturunkan dari status — tidak pernah diketik manusia. */
export function completedAtFor(status: PhaseStatus, now: Date, previous: Date | null): Date | null {
  if (status !== "selesai") return null;
  return previous ?? now;
}
