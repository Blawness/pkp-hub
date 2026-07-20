import { and, eq, exists, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, projectPhases, projects } from "@/lib/db/schema";

/**
 * THE SECURITY BOUNDARY (Phase 2 brief §4).
 *
 * `proxy.ts` is only a coarse, cookie-presence gate. Every server
 * action / RSC / route handler that touches project or client data MUST go
 * through the helpers below — they are the only place row-level scoping is
 * enforced. Never bypass `assertProjectAccess` / `listProjectsForUser` by
 * querying `projects` directly from a route.
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

/**
 * Session user whose role is one of `roles`, else redirect to the area their
 * own role belongs to (never a 403 loop, never falls through).
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect(homeForRole(user.role));
  }
  return user;
}

export function requireAdmin() {
  return requireRole("admin");
}

export function requireStaff() {
  return requireRole("admin", "surveyor");
}

export function requireClient() {
  return requireRole("client");
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

/**
 * Returns the project ONLY if `user` is allowed to see it:
 * - admin: any project
 * - surveyor: only if `assignedSurveyorId === user.id`
 * - client: only if the project's `clientId` matches the client row linked
 *   to `user.id` via `clients.userId`
 *
 * Otherwise calls `notFound()` — never leaks another tenant's row, and never
 * distinguishes "doesn't exist" from "not yours" in the response.
 */
export async function assertProjectAccess(projectId: string, user: SessionUser) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) notFound();

  if (user.role === "admin") return project;

  if (user.role === "surveyor") {
    if (project.assignedSurveyorId === user.id) return project;
    // Di-assign ke salah satu FASE proyek ini juga memberi akses (spec
    // 2026-07-14). Tanpa ini, menugaskan surveyor ke sebuah fase tidak
    // memberinya apa pun dan fiturnya cuma hiasan.
    const [phase] = await db
      .select({ id: projectPhases.id })
      .from(projectPhases)
      .where(
        and(eq(projectPhases.projectId, project.id), eq(projectPhases.assignedSurveyorId, user.id)),
      )
      .limit(1);
    if (phase) return project;
    notFound();
  }

  if (user.role === "client") {
    const clientId = await getClientIdForUser(user.id);
    if (clientId && project.clientId === clientId) return project;
    notFound();
  }

  // Exhaustive guard: unknown role must never fall through to "granted".
  notFound();
}

/**
 * List projects scoped to `user`'s role, applying the same rules as
 * `assertProjectAccess`.
 */
export async function listProjectsForUser(user: SessionUser) {
  if (user.role === "admin") {
    return db.select().from(projects);
  }

  if (user.role === "surveyor") {
    // Aturan HARUS sama persis dengan `assertProjectAccess` di atas. Kalau
    // hanya guard yang diperluas, proyeknya bisa dibuka lewat URL langsung tapi
    // tidak muncul di daftar — dalam praktik, tidak bisa ditemukan.
    // `exists` (bukan join) supaya proyek dengan dua fase milik orang yang sama
    // tidak muncul dua kali.
    return db
      .select()
      .from(projects)
      .where(
        or(
          eq(projects.assignedSurveyorId, user.id),
          exists(
            db
              .select({ one: sql`1` })
              .from(projectPhases)
              .where(
                and(
                  eq(projectPhases.projectId, projects.id),
                  eq(projectPhases.assignedSurveyorId, user.id),
                ),
              ),
          ),
        ),
      );
  }

  if (user.role === "client") {
    const clientId = await getClientIdForUser(user.id);
    if (!clientId) return [];
    return db.select().from(projects).where(eq(projects.clientId, clientId));
  }

  return [];
}
