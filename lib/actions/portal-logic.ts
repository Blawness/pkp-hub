import { asc, eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess, listProjectsForUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projectPhases } from "@/lib/db/schema";
import { calculateProgress, type PhaseStatus } from "@/lib/phases/derive";

/**
 * Server-only business logic for the client portal's project list (PRD §3
 * Feature 6). The detail page (`app/portal/projects/[id]/page.tsx`) does
 * NOT go through a wrapper here — it calls `assertProjectAccess` directly
 * (same pattern as `app/dashboard/projects/[id]/page.tsx`) so a real
 * `notFound()` propagates for a project a client doesn't own, rather than
 * a translated 500. `listSharedDocumentsForProject` /
 * `listMapLayersForProject` re-verify access themselves (defense in depth),
 * same as the staff project page.
 */

function requireClientRole(user: SessionUser) {
  if (user.role !== "client") {
    throw new Error("Only a client can view the portal.");
  }
}

export type PortalProjectSummary = {
  id: string;
  title: string;
  status: string;
  surveyType: string;
  locationLabel: string | null;
  orderDate: Date;
};

/**
 * The logged-in client's own projects, newest first. Sourced entirely via
 * `listProjectsForUser` — the row-level scoping boundary — which for a
 * `client` role already returns only rows whose `clientId` matches the
 * `clients` row linked to this user (never another client's projects).
 */
export async function listPortalProjects(user: SessionUser): Promise<PortalProjectSummary[]> {
  requireClientRole(user);
  const rows = await listProjectsForUser(user);
  return rows
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      surveyType: p.surveyType,
      locationLabel: p.locationLabel,
      orderDate: p.orderDate,
    }))
    .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());
}

export type PortalPhase = {
  id: string;
  name: string;
  status: PhaseStatus;
  sortOrder: number;
  targetDate: string | null;
  completedAt: Date | null;
};

/**
 * Fase seperti yang dilihat KLIEN (spec 2026-07-14). `description` (catatan
 * internal), `weight`, dan `assignedSurveyorId` dipangkas DI SINI, di level
 * query — bukan di render. Portal klien saat ini tidak menampilkan nama
 * surveyor di mana pun, dan fitur ini bukan tempat untuk diam-diam mengubah
 * itu.
 */
export async function listPortalPhases(
  user: SessionUser,
  projectId: string,
): Promise<PortalPhase[]> {
  await assertProjectAccess(projectId, user);

  return db
    .select({
      id: projectPhases.id,
      name: projectPhases.name,
      status: projectPhases.status,
      sortOrder: projectPhases.sortOrder,
      targetDate: projectPhases.targetDate,
      completedAt: projectPhases.completedAt,
    })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sortOrder));
}

/**
 * Persen progres portal — dihitung dari fase LENGKAP di server (`calculateProgress`
 * butuh `weight`), lalu hanya angkanya yang keluar dari fungsi ini. `weight`
 * sendiri tidak pernah sampai ke pemanggil.
 */
export async function getPortalProgress(
  user: SessionUser,
  projectId: string,
): Promise<number | null> {
  await assertProjectAccess(projectId, user);
  const rows = await db
    .select({ status: projectPhases.status, weight: projectPhases.weight })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId));
  return calculateProgress(rows);
}
