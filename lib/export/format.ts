import type { CellFormat } from "@/lib/export/types";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * Nilai sel → teks untuk PDF. `null` selalu jadi string kosong: sel kosong,
 * bukan "null" atau "-". Currency/date pakai format id-ID; number pakai
 * pemisah ribuan id-ID tanpa desimal.
 */
export function formatCellText(
  value: string | number | Date | null,
  format: CellFormat = "text",
): string {
  if (value == null) return "";
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(value as number);
    case "number":
      return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value as number);
    case "date": {
      const d = value as Date;
      return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
    }
    default:
      return String(value);
  }
}

/**
 * Nilai sel → tipe asli untuk XLSX (supaya bisa dijumlahkan/di-pivot).
 * `null` tetap null. Currency/number → number, date → Date, text → string.
 */
export function formatCellValue(
  value: string | number | Date | null,
  format: CellFormat = "text",
): string | number | Date | null {
  if (value == null) return null;
  if (format === "currency" || format === "number") return value as number;
  if (format === "date") return value as Date;
  return String(value);
}
