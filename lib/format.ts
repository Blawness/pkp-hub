/** IDR currency, id-ID locale, no decimals (e.g. `Rp7.500.000`). `null`/`undefined` -> "—". */
export function formatIDR(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

const relative = new Intl.RelativeTimeFormat("id-ID", { numeric: "auto" });

/**
 * Waktu relatif ringkas, mis. `2 hari lalu` / `kemarin`.
 *
 * Dipanggil dari Server Component, jadi "sekarang" adalah jam server. Untuk
 * granularitas hari ke atas itu tidak masalah; jangan pakai ini untuk selisih
 * dalam hitungan menit, yang akan terasa meleset bagi klien di zona waktu lain.
 */
export function formatRelativeDate(date: Date, now: Date = new Date()): string {
  const days = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (Math.abs(days) < 1) return "hari ini";
  if (Math.abs(days) < 30) return relative.format(days, "day");
  if (Math.abs(days) < 365) return relative.format(Math.round(days / 30), "month");
  return relative.format(Math.round(days / 365), "year");
}

/** Human-readable file size, e.g. `1.2 MB`. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

const BULAN = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * `"2026-07-14"` -> `"14 Juli 2026"`.
 *
 * Sengaja mem-parse string, BUKAN `new Date(iso).toLocaleDateString()`:
 * `new Date("2026-07-14")` adalah tengah malam UTC, dan di server ber-offset
 * negatif ia dirender jadi 13 Juli. Tanggal pembayaran tidak boleh bergeser.
 */
export function formatTanggalIndo(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}
