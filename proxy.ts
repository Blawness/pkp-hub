import { getCookieCache } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import type { Role } from "@/lib/auth-guards";

/**
 * Coarse route gate. Reads the signed session cookie cache (no DB call) to
 * decide unauthenticated vs. wrong-area redirects fast at the edge of the
 * request. This is NOT the security boundary — every server action / RSC
 * still calls the authoritative helpers in `lib/auth-guards.ts`, which hit
 * the DB and do row-level scoping. See phase-2 brief §3–§4.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isDashboard = pathname.startsWith("/dashboard");
  const isPortal = pathname.startsWith("/portal");

  if (!isDashboard && !isPortal) {
    return NextResponse.next();
  }

  const cache = await getCookieCache(request);
  // Type-only import dari auth-guards: `Role` hilang saat kompilasi, jadi
  // proxy tidak ikut menarik lib/db ke runtime-nya. Menyalin union-nya di sini
  // justru yang berbahaya — salinan itu tetap menyebut "owner" setelah enum
  // di-rename, dan tidak ada yang memberitahu.
  const role = cache?.user?.role as Role | undefined;

  if (!role) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
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
