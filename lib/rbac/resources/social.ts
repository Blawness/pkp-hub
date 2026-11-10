import { defineResource } from "../define-resource";

/**
 * Tracking pipeline sosmed (postingan IG + komentar reachout).
 *
 * Table-less seperti `report`: halaman Sosmed hanya MEMBACA dua tabel berbeda
 * (`social_post` dan `social_comment`) sekaligus, jadi tidak ada satu tabel
 * yang bisa dijadikan dasar `rbacFilter`. Gerbangnya cukup `can()` di logic.
 *
 * Sengaja hanya `read` dan tidak diberikan ke surveyor/klien — data marketing
 * bukan pekerjaan lapangan maupun hak portal. Penulisan data TIDAK lewat
 * action: satu-satunya jalur masuk adalah `POST /api/sosmed/sync` dengan token
 * mesin, bukan sesi user.
 */
export const socialResource = defineResource({
  name: "social",
  actions: ["read"],
});
