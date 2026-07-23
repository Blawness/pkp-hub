import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectPhases, projects } from "@/lib/db/schema";
import { calculateProgress, type PhaseStatus } from "@/lib/phases/derive";
import { scopeOf } from "@/lib/rbac/can";
import { rbacFilter } from "@/lib/rbac/filter";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Server-only business logic for the client portal's project list (PRD §3
 * Feature 6). Akses baris ditegakkan engine RBAC: daftar lewat
 * `rbacFilter(ctx, "project.read")`, satu-proyek lewat `requireScopedRow` —
 * aturan yang SAMA dengan daftar, jadi `notFound()` asli menjalar untuk
 * proyek milik klien lain. `listSharedDocumentsForProject` /
 * `listMapLayersForProject` re-verify access themselves (defense in depth),
 * same as the staff project page.
 */

/** Portal = tampilan "proyek MILIKKU": butuh `project.read` ber-scope `own`. */
function requireOwnScope(ctx: RbacContext) {
  if (scopeOf(ctx, "project.read") !== "own") {
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
 * `rbacFilter(ctx, "project.read")` — the row-level scoping boundary — which
 * for scope `own` already returns only rows whose `clientId` matches the
 * `clients` row linked to this user (never another client's projects).
 * Proyeksi eksplisit: kolom finance tidak pernah ikut ter-SELECT.
 */
export async function listPortalProjects(ctx: RbacContext): Promise<PortalProjectSummary[]> {
  requireOwnScope(ctx);
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      surveyType: projects.surveyType,
      locationLabel: projects.locationLabel,
      orderDate: projects.orderDate,
    })
    .from(projects)
    .where(rbacFilter(ctx, "project.read"));
  return rows.sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());
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
  ctx: RbacContext,
  projectId: string,
): Promise<PortalPhase[]> {
  await requireScopedRow(ctx, "project.read", projectId);

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
  ctx: RbacContext,
  projectId: string,
): Promise<number | null> {
  await requireScopedRow(ctx, "project.read", projectId);
  const rows = await db
    .select({ status: projectPhases.status, weight: projectPhases.weight })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId));
  return calculateProgress(rows);
}
