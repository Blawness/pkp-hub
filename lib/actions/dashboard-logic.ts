import { and, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, payments, projects, users } from "@/lib/db/schema";
import { scopeOf } from "@/lib/rbac/can";
import { rbacFilter } from "@/lib/rbac/filter";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Server-only business logic for the per-role Dashboard Ringkasan (PRD §3
 * Feature 7), directly unit-tested in `dashboard.test.ts`.
 *
 * `totalUnpaid` adalah piutang EKSAK: `projectValue − uang yang sudah masuk`
 * untuk tiap proyek non-`dibatalkan` yang belum lunas (spec 2026-07-14). Dulu
 * ia menjumlahkan `projectValue` PENUH untuk proyek berstatus belum|sebagian,
 * jadi proyek yang DP-nya sudah 80% masuk tetap dihitung piutang penuh —
 * angkanya selalu lebih besar dari kenyataan. `dibatalkan` tetap dikecualikan:
 * piutang proyek batal bukan pendapatan yang tertunda.
 *
 * CRITICAL, security-load-bearing: `getSurveyorDashboardData` builds its
 * output as an explicit field-by-field projection — it NEVER spreads a raw
 * project row. `projectValue` / `paymentStatus` / `paymentNotes` are simply
 * never copied into the object it returns, so they cannot leak into a
 * surveyor's page props / RSC payload no matter what a page does with the
 * result. This is enforced (not just documented) by
 * `dashboard.test.ts`'s key-absence assertion.
 *
 * Both functions source their project rows via `rbacFilter(ctx,
 * "project.read")` — the row-level scoping boundary of the RBAC engine —
 * never a raw, unscoped `db.select()` on `projects`.
 */

const INACTIVE_STATUSES = new Set(["selesai", "dibatalkan"]);
const CANCELLED_STATUS = "dibatalkan";
const NEEDS_ACTION_STATUSES = new Set(["baru", "dijadwalkan", "data_diambil"]);

/** Uang yang sudah masuk per proyek (baris batal TIDAK dihitung). */
async function paidByProject(projectIds: string[]): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({
      projectId: payments.projectId,
      paid: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(and(inArray(payments.projectId, projectIds), isNull(payments.voidedAt)))
    .groupBy(payments.projectId);
  return new Map(rows.map((r) => [r.projectId, r.paid]));
}

// Tidak ada resource `dashboard` — kedua tampilan digerbangi lewat SCOPE izin
// proyek, pola yang sama dengan `listReceiptsForAdmin` di payments-logic:
// `can()` saja tidak cukup karena klien pun punya `project.readFinance:own`.

/** Dashboard admin = agregat finance SELURUH studio: butuh readFinance `all`. */
function requireStudioFinanceScope(ctx: RbacContext) {
  if (scopeOf(ctx, "project.readFinance") !== "all") {
    throw new Error("Only the admin can view the admin dashboard.");
  }
}

/** Dashboard surveyor = antrean kerja "yang ditugaskan padaku": scope `assigned`. */
function requireAssignedScope(ctx: RbacContext) {
  if (scopeOf(ctx, "project.read") !== "assigned") {
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

async function surveyorNameMap(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id !== null))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((u) => [u.id, u.name]));
}

export type AdminDashboardLatestProject = {
  id: string;
  title: string;
  status: string;
  surveyType: string;
  clientName: string;
  surveyorName: string | null;
  orderDate: Date;
};

export type AdminDashboardData = {
  countsByStatus: Record<string, number>;
  totalActiveValue: number;
  totalUnpaid: number;
  latestProjects: AdminDashboardLatestProject[];
};

/** Admin-only: project counts per status, total active value, total unpaid, latest projects. */
export async function getAdminDashboardData(ctx: RbacContext): Promise<AdminDashboardData> {
  requireStudioFinanceScope(ctx);
  const allProjects = await db.select().from(projects).where(rbacFilter(ctx, "project.read"));

  const paid = await paidByProject(allProjects.map((p) => p.id));

  const countsByStatus: Record<string, number> = {};
  let totalActiveValue = 0;
  let totalUnpaid = 0;
  for (const p of allProjects) {
    countsByStatus[p.status] = (countsByStatus[p.status] ?? 0) + 1;
    if (!INACTIVE_STATUSES.has(p.status)) {
      totalActiveValue += p.projectValue ?? 0;
    }
    // Piutang EKSAK: nilai proyek dikurangi uang yang sudah benar-benar masuk.
    // Dulu ini menjumlahkan `projectValue` PENUH untuk setiap proyek yang belum
    // lunas, jadi proyek yang DP-nya 80% masuk tetap dihitung sebagai piutang
    // penuh — angkanya selalu lebih besar dari kenyataan. `dibatalkan` tetap
    // dikecualikan: piutang proyek batal bukan pendapatan yang tertunda.
    if (p.status !== CANCELLED_STATUS) {
      totalUnpaid += Math.max(0, (p.projectValue ?? 0) - (paid.get(p.id) ?? 0));
    }
  }

  // Hanya 5 proyek terbaru yang ditampilkan, jadi nama surveyor cukup dicari
  // untuk lima itu — bukan untuk seluruh proyek studio.
  const latest = [...allProjects]
    .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime())
    .slice(0, 5);

  const [nameById, surveyorById] = await Promise.all([
    clientNameMap(allProjects.map((p) => p.clientId)),
    surveyorNameMap(latest.map((p) => p.assignedSurveyorId)),
  ]);

  const latestProjects = latest.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    surveyType: p.surveyType,
    clientName: nameById.get(p.clientId) ?? "—",
    surveyorName: p.assignedSurveyorId ? (surveyorById.get(p.assignedSurveyorId) ?? null) : null,
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
export async function getSurveyorDashboardData(ctx: RbacContext): Promise<SurveyorDashboardData> {
  requireAssignedScope(ctx);
  // Kolom finance tidak pernah ikut ter-SELECT — proyeksi eksplisit, bukan
  // baris penuh yang dipangkas belakangan. Lihat komentar modul.
  const assigned = await db
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      surveyType: projects.surveyType,
      locationLabel: projects.locationLabel,
      clientId: projects.clientId,
      orderDate: projects.orderDate,
    })
    .from(projects)
    .where(rbacFilter(ctx, "project.read"));

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
