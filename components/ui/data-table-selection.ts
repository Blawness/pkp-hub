/**
 * Perbandingan isi array string TANPA tergantung reference equality. Dipakai
 * untuk memutus siklus ping-pong antara dua efek sync di `DataTable` —
 * lihat `data-table.tsx` atas alasan detailnya.
 *
 * `Object.keys(rowSelection)` selalu mengembalikan array baru, dan
 * `setSelectedIds(newArray)` di parent memicu re-render dengan reference
 * prop baru. Bandingkan via `===` di dalam `useEffect` lalu tidak cukup
 * karena deps berubah tiap cycle; yang perlu dijaga adalah "apakah kontennya
 * sama" — dan jawaban itu yang dipakai efek untuk skip pemanggilan setter.
 */
export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  // Sort agar urutan tidak ikut menentukan — `Object.keys` dan array dari
  // parent tidak punya jaminan urutan yang konsisten.
  const sa = [...a].sort();
  const sb = [...b].sort();
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return false;
  }
  return true;
}
