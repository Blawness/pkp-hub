"use client";

import { useSession } from "@/lib/auth-client";

/**
 * Denyut hidup sesi login. Dirender di layout `/dashboard` dan `/portal`,
 * tapi tidak menampilkan apa pun — tugasnya satu: memanggil
 * `/api/auth/get-session` dari BROWSER.
 *
 * Kenapa perlu: Server Component tidak boleh menulis cookie saat render —
 * guard di `lib/auth-guards.ts` membaca sesi dengan `disableRefresh: true`
 * supaya render tidak "memakan" jendela refresh (flag skip-RSC bawaan
 * `nextCookies()` terbukti tidak berlaku di Next 16). Satu-satunya jalur
 * tempat perpanjangan `session_token` (maxAge 7 hari) benar-benar sampai ke
 * browser adalah response HTTP biasa — yaitu panggilan ini.
 *
 * `useSession` mem-fetch saat mount dan setiap window kembali fokus, jadi
 * selama user masih membuka aplikasi dalam jendela 7 hari, cookienya terus
 * diperpanjang (sliding expiry) dan "Ingat saya" behaves seperti yang
 * dijanjikan. Tanpanya, semua user ke-logout paksa tepat di hari ke-7.
 */
export function SessionHeartbeat() {
  useSession();
  return null;
}
