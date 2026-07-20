/**
 * Helper murni tata letak PDF. Tidak ada dependency pdf-lib di sini supaya
 * bisa diuji secara terisolasi.
 *
 * `estimateWidth` = lebar teks dalam titik, dihitung dari `charWidth * len`
 * (font monospace-ish approximation). `maxWidth` adalah sisa lebar kolom.
 * Kalau teks muat, kembalikan apa adanya. Kalau lewat, potong karakter dari
 * belakang sampai `text + ellipsis` muat, lalu tambahi `ellipsis`.
 */
export function truncateToWidth(
  text: string,
  charWidth: number,
  maxWidth: number,
  ellipsis: string,
): string {
  if (text.length === 0) return text;
  if (text.length * charWidth <= maxWidth) return text;

  const ellipsisWidth = ellipsis.length * charWidth;
  // Kasus ekstrem: kolom lebih sempit dari ellipsis sendiri → balikkan ellipsis.
  if (maxWidth <= ellipsisWidth) return ellipsis.slice(0, Math.max(1, Math.floor(maxWidth / charWidth)));

  let len = text.length;
  while (len > 0 && len * charWidth + ellipsisWidth > maxWidth) {
    len -= 1;
  }
  return text.slice(0, len) + ellipsis;
}

/**
 * Bagi `total` baris ke halaman berkapasitas `perPage`. Mengembalikan array
 * jumlah baris per halaman. `paginateRows(0, n)` → `[0]` (satu halaman kosong)
 * supaya header tetap tercetak saat laporan nol baris.
 */
export function paginateRows(total: number, perPage: number): number[] {
  if (total <= 0) return [0];
  const pages: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const take = Math.min(perPage, remaining);
    pages.push(take);
    remaining -= take;
  }
  return pages;
}
