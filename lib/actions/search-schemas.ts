import { z } from "zod";

/**
 * Skema input untuk `globalSearch` (spec 2026-07-26, Task 2). Pagar 1..80 char
 * — di bawah 1 berarti user sengaja/belum selesai mengetik, di atas 80 char
 * menjadi mahal tanpa hasil yang lebih berguna (cmd-K bukan mesin cari umum).
 * `trim` di sini; lowercasing dilakukan lagi di layer logika sebagai pagar
 * kedua bagi pemanggil yang bypass schema (mis. unit test).
 */
export const globalSearchInputSchema = z.object({
  q: z.string().trim().min(1).max(80),
});
export type GlobalSearchInput = z.infer<typeof globalSearchInputSchema>;
