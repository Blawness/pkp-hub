import { inArray } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { listProjectsForUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";

/**
 * Server-only business logic for the per-role Dashboard Ringkasan (PRD §3
 * Feature 7), directly unit-tested in `dashboard.test.ts`.
 *
 * CRITICAL, security-load-bearing: `getSurveyorDashboardData` builds its
 * output as an explicit field-by-field projection — it NEVER spreads a raw
 * project row. `projectValue` / `paymentStatus` / `paymentNotes` are simply
 * never copied into the object it returns, so they cannot leak into a
 * surveyor's page props / RSC payload no matter what a page does with the
 * result. This is enforced (not just documented) by
 * `dashboard.test.ts`'s key-absence assertion.
 *
 * Both functions source their project rows via `listProjectsForUser` — the
 * row-level scoping boundary in `lib/auth-guards.ts` — never a raw,
 * unscoped `db.select()` on `projects`.
 */

const INACTIVE_STATUSES = new Set(["selesai", "dibatalkan"]);
const UNPAID_STATUSES = new Set(["belum", "sebagian"]);
const NEEDS_ACTION_STATUSES = new Set(["baru", "dijadwalkan", "data_diambil"]);

function requireOwner(user: SessionUser) {
  if (user.role !== "owner") {
    throw new Error("Only the owner can view the owner dashboard.");
  }
}

function requireSurveyor(user: SessionUser) {
  if (user.role !== "surveyor") {
    throw new Error("Only a surveyor can view the surveyor dashboard.");
  }
}

async function clientNameMap(clientIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(clientIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(inArray(clients.id, ids));
  return new Map(rows.map((c) => [c.id, c.name]));
}

export type OwnerDashboardLatestProject = {
  id: string;
  title: string;
  status: string;
  clientName: string;
  orderDate: Date;
};

export type OwnerDashboardData = {
  countsByStatus: Record<string, number>;
  totalActiveValue: number;
  totalUnpaid: number;
  latestProjects: OwnerDashboardLatestProject[];
};

/** Owner-only: project counts per status, total active value, total unpaid, latest projects. */
export async function getOwnerDashboardData(user: SessionUser): Promise<OwnerDashboardData> {
  requireOwner(user);
  const allProjects = await listProjectsForUser(user);

  const countsByStatus: Record<string, number> = {};
  let totalActiveValue = 0;
  let totalUnpaid = 0;
  for (const p of allProjects) {
    countsByStatus[p.status] = (countsByStatus[p.status] ?? 0) + 1;
    if (!INACTIVE_STATUSES.has(p.status)) {
      totalActiveValue += p.projectValue ?? 0;
    }
    if (UNPAID_STATUSES.has(p.paymentStatus)) {
      totalUnpaid += p.projectValue ?? 0;
    }
  }

  const nameById = await clientNameMap(allProjects.map((p) => p.clientId));
  const latestProjects = [...allProjects]
    .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime())
    .slice(0, 5)
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      clientName: nameById.get(p.clientId) ?? "—",
      orderDate: p.orderDate,
    }));

  return { countsByStatus, totalActiveValue, totalUnpaid, latestProjects };
}

/**
 * Surveyor-facing project row. Deliberately excludes `projectValue` /
 * `paymentStatus` / `paymentNotes` — see module doc comment.
 */
export type SurveyorDashboardProject = {
  id: string;
  title: string;
  status: string;
  surveyType: string;
  locationLabel: string | null;
  clientName: string;
  orderDate: Date;
  needsAction: boolean;
};

export type SurveyorDashboardData = {
  projects: SurveyorDashboardProject[];
  needsActionCount: number;
};

/** Surveyor-only: only their assigned projects, no finance figures whatsoever. */
export async function getSurveyorDashboardData(user: SessionUser): Promise<SurveyorDashboardData> {
  requireSurveyor(user);
  const assigned = await listProjectsForUser(user);

  const nameById = await clientNameMap(assigned.map((p) => p.clientId));
  const sorted = [...assigned].sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());

  const projectRows: SurveyorDashboardProject[] = sorted.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    surveyType: p.surveyType,
    locationLabel: p.locationLabel,
    clientName: nameById.get(p.clientId) ?? "—",
    orderDate: p.orderDate,
    needsAction: NEEDS_ACTION_STATUSES.has(p.status),
  }));

  return {
    projects: projectRows,
    needsActionCount: projectRows.filter((p) => p.needsAction).length,
  };
}
