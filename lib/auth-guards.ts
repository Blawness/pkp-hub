import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, projects } from "@/lib/db/schema";

/**
 * THE SECURITY BOUNDARY (Phase 2 brief §4).
 *
 * `middleware.ts` is only a coarse, cookie-presence gate. Every server
 * action / RSC / route handler that touches project or client data MUST go
 * through the helpers below — they are the only place row-level scoping is
 * enforced. Never bypass `assertProjectAccess` / `listProjectsForUser` by
 * querying `projects` directly from a route.
 */

export type Role = "owner" | "surveyor" | "client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** URL prefix each role should land on / be bounced back to. */
function homeForRole(role: Role): string {
  return role === "client" ? "/portal" : "/dashboard";
}

/** Current session, or null if unauthenticated. Never throws. */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  // `disableCookieCache: true` forces a real DB lookup. `session.cookieCache`
  // in `lib/auth.ts` is still enabled for `middleware.ts`'s coarse, cheap
  // gate, but THIS is the security boundary (see file header), so it must
  // never trust the (up to 5-minute stale) signed cookie — a revoked/deleted
  // session or a role change (owner -> client) has to take effect immediately.
  const session = await auth.api.getSession({
    headers: await headers(),
    query: { disableCookieCache: true },
  });
  if (!session) return null;
  return { user: session.user as SessionUser };
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

export function requireOwner() {
  return requireRole("owner");
}

export function requireStaff() {
  return requireRole("owner", "surveyor");
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
 * - owner: any project
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

  if (user.role === "owner") return project;

  if (user.role === "surveyor") {
    if (project.assignedSurveyorId === user.id) return project;
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
  if (user.role === "owner") {
    return db.select().from(projects);
  }

  if (user.role === "surveyor") {
    return db.select().from(projects).where(eq(projects.assignedSurveyorId, user.id));
  }

  if (user.role === "client") {
    const clientId = await getClientIdForUser(user.id);
    if (!clientId) return [];
    return db.select().from(projects).where(eq(projects.clientId, clientId));
  }

  return [];
}
