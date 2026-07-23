import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";

/**
 * THE SECURITY BOUNDARY (Phase 2 brief §4) — lapis SESI-nya.
 *
 * `proxy.ts` is only a coarse, cookie-presence gate; `getSession`/
 * `requireUser` di file ini yang benar-benar memverifikasi sesi ke DB.
 * Otorisasi (izin & scoping baris) hidup di engine RBAC (`lib/rbac/`):
 * action lewat `rbacActionClient`, daftar lewat `rbacFilter`, satu baris
 * lewat `requireScopedRow`. Jangan query `projects`/`clients` mentah dari
 * route untuk melewatinya.
 */

export type Role = "admin" | "surveyor" | "client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** URL prefix each role should land on / be bounced back to. */
export function homeForRole(role: Role): string {
  return role === "client" ? "/portal" : "/dashboard";
}

/**
 * Current session, or null if unauthenticated. Never throws.
 *
 * User yang diarsipkan diperlakukan SAMA dengan tidak login. Pengecekannya ada
 * di sini, di batas keamanan, bukan di masing-masing halaman — arsip yang cuma
 * menyembunyikan baris dari sebuah tabel tidak mencabut akses siapa pun.
 *
 * Pengarsipan juga menghapus baris `sessions` milik user itu (lihat
 * `users-logic.ts`), jadi sesi yang sedang berjalan langsung putus. Sabuk dan
 * bretel: kalaupun ada baris sesi yang lolos, gerbang ini tetap menutupnya.
 */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  // `disableCookieCache: true` forces a real DB lookup. `session.cookieCache`
  // in `lib/auth.ts` is still enabled for `proxy.ts`'s coarse, cheap
  // gate, but THIS is the security boundary (see file header), so it must
  // never trust the (up to 5-minute stale) signed cookie — a revoked/deleted
  // session or a role change (admin -> client) has to take effect immediately.
  //
  // `disableRefresh: true` sama pentingnya: guard ini jalan di Server
  // Component, yang TIDAK BISA mengirim `Set-Cookie` ke browser. Kalau baca
  // ini ikut me-refresh sesi, baris DB memanjang tapi cookie browser tetap
  // berumur lama — dan lebih parah, sesi tergeser keluar dari jendela
  // `updateAge` sehingga `SessionHeartbeat` yang datang beberapa milidetik
  // kemudian tidak lagi menerbitkan ulang cookie-nya. User tetap ke-logout
  // di hari ke-7 (terbukti di e2e: flag skip-RSC plugin `nextCookies()`
  // tidak berlaku di Next 16, jadi refresh RSC benar-benar terjadi).
  // Memperpanjang sesi HANYA boleh terjadi di route handler HTTP yang
  // dipanggil heartbeat — di sana `Set-Cookie` pasti sampai ke browser.
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) return null;

  const user = session.user as SessionUser & { archivedAt?: Date | string | null };
  if (user.archivedAt) return null;

  return { user };
}

/** Session user, or redirect to /login if unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}

/** The `clients.id` row linked to this portal user, or null if unlinked. */
export async function getClientIdForUser(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.userId, userId))
    .limit(1);
  return row?.id ?? null;
}
