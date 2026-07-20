import { getCookieCache, getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/auth-guards";

/**
 * Coarse route gate. Reads cookies only (no DB call) to decide
 * unauthenticated vs. wrong-area redirects fast at the edge of the request.
 * This is NOT the security boundary — every server action / RSC still calls
 * the authoritative helpers in `lib/auth-guards.ts`, which hit the DB and do
 * row-level scoping. See phase-2 brief §3–§4.
 *
 * Dua cookie yang dibaca di sini punya umur yang SANGAT berbeda, dan
 * membedakannya adalah inti dari gerbang ini:
 *
 *  - `session_token` (7 hari, sliding) — satu-satunya bukti "user ini sudah
 *    login". Diperpanjang lewat response `/api/auth/get-session` (dipanggil
 *    `SessionHeartbeat` dari browser + `nextCookies()` di lib/auth.ts).
 *  - `session_data`  (5 menit, `session.cookieCache.maxAge` di lib/auth.ts) —
 *    hanya cache berisi role. Ia kini ikut diperbarui oleh jalur yang sama,
 *    tapi umurnya memang pendek dan boleh hilang kapan pun (tab baru dibuka,
 *    user belum membuka app 5 menit, dsb).
 *
 * Menilai "sudah login atau belum" dari `session_data` — seperti versi
 * sebelum 2026-07 — berarti menendang setiap user ke /login begitu cache itu
 * basi, padahal `session_token`-nya masih sah berhari-hari. Itu bug produksi
 * yang nyata, dan `proxy.test.ts` menguncinya.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isPortal = pathname.startsWith("/portal");

  if (!isDashboard && !isPortal) {
    return NextResponse.next();
  }

  if (!getSessionCookie(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Mulai sini user PASTI punya session_token. Cookie cache cuma dipakai untuk
  // membelokkan salah-area lebih awal, dan itu murni optimasi: begitu ia basi
  // (atau belum sempat ditulis) kita teruskan saja, karena layout `/dashboard`
  // dan `/portal` sudah memanggil `requireStaff`/`requireClient` yang
  // membelokkan berdasarkan role dari DB. Gerbang ini boleh melewatkan, tidak
  // boleh salah menolak.
  //
  // Type-only import dari auth-guards: `Role` hilang saat kompilasi, jadi
  // proxy tidak ikut menarik lib/db ke runtime-nya. Menyalin union-nya di sini
  // justru yang berbahaya — salinan itu tetap menyebut "owner" setelah enum
  // di-rename, dan tidak ada yang memberitahu.
  const cache = await getCookieCache(request);
  const role = cache?.user?.role as Role | undefined;
  if (!role) {
    return NextResponse.next();
  }

  if (isDashboard && role === "client") {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  if (isPortal && role !== "client") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/portal/:path*"],
};
