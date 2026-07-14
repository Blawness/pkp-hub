/**
 * Angka → kata Bahasa Indonesia, untuk baris "Terbilang" di kwitansi.
 * Murni, tanpa dependency. Bentuk khusus ("sebelas"/"seratus"/"seribu")
 * ditangani lewat cabang eksplisit, bukan lewat penggabungan naif.
 */

const SATUAN = [
  "",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

function toWords(n: number): string {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${toWords(n - 10)} belas`;
  if (n < 100) return `${toWords(Math.floor(n / 10))} puluh ${toWords(n % 10)}`;
  if (n < 200) return `seratus ${toWords(n - 100)}`;
  if (n < 1_000) return `${toWords(Math.floor(n / 100))} ratus ${toWords(n % 100)}`;
  if (n < 2_000) return `seribu ${toWords(n - 1_000)}`;
  if (n < 1_000_000) return `${toWords(Math.floor(n / 1_000))} ribu ${toWords(n % 1_000)}`;
  if (n < 1_000_000_000)
    return `${toWords(Math.floor(n / 1_000_000))} juta ${toWords(n % 1_000_000)}`;
  if (n < 1_000_000_000_000)
    return `${toWords(Math.floor(n / 1_000_000_000))} miliar ${toWords(n % 1_000_000_000)}`;
  return `${toWords(Math.floor(n / 1_000_000_000_000))} triliun ${toWords(n % 1_000_000_000_000)}`;
}

/** `7500000` -> `"tujuh juta lima ratus ribu"`. Hanya bilangan bulat >= 0. */
export function terbilang(n: number): string {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("terbilang: hanya menerima bilangan bulat non-negatif.");
  }
  if (n === 0) return "nol";
  return toWords(n).replace(/\s+/g, " ").trim();
}

/** `7500000` -> `"Tujuh Juta Lima Ratus Ribu Rupiah"` — bentuk yang dicetak di kwitansi. */
export function terbilangRupiah(n: number): string {
  const words = terbilang(n)
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return `${words} Rupiah`;
}
