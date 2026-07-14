import { z } from "zod";

/**
 * Skema profil.
 *
 * Perhatikan apa yang TIDAK ada di sini: `userId`. Itu bukan kelalaian — itu
 * batas keamanannya. `updateOwnNameAction` mengambil id dari `ctx.user.id`
 * (sesi), jadi tidak ada tempat bagi pemanggil untuk menunjuk akun orang lain.
 * Zod juga membuang key tak dikenal, jadi `userId` yang diselundupkan lewat
 * body tidak akan pernah sampai ke logic.
 */
export const updateOwnNameSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(120, "Nama terlalu panjang."),
});
