import type { Role } from "@/lib/auth-guards";

/**
 * Modul PURE (tanpa import runtime server) karena dipakai dari dua sisi:
 * `components/auth/login-form.tsx` (client component — tidak boleh menarik
 * lib/db lewat auth-guards) dan `app/login/page.tsx` (RSC). Type-only import
 * `Role` hilang saat kompilasi — trik yang sama dengan `proxy.ts`.
 */

/**
 * Only accept `redirectTo` values that are a same-app relative path, e.g.
 * `/dashboard/projects/123`. Rejects absolute URLs, protocol-relative URLs
 * (`//evil.com`), and backslash tricks (`/\evil.com`) that browsers can
 * interpret as scheme-relative — anything that isn't unambiguously a local
 * path is dropped in favor of the role's default landing page, so this can
 * never become an open redirect.
 */
export function sanitizeRedirectTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("/\\")) return null;
  return value;
}

/**
 * Tujuan akhir setelah login (atau saat user ber-sesi mendarat di /login).
 * Only honor `redirectTo` if it lands in the area the user's role is
 * actually allowed into — a client's stale deep-link into /dashboard
 * must not override the client's own portal home.
 */
export function loginDestination(role: Role, redirectTo: string | null): string {
  const roleHome = role === "client" ? "/portal" : "/dashboard";
  const safe = sanitizeRedirectTo(redirectTo);
  return safe?.startsWith(roleHome) ? safe : roleHome;
}
