import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectStatusLogs, projects, users } from "@/lib/db/schema";
import { statusLabel } from "@/lib/labels";
import { notifyClientOfStatusChange } from "@/lib/notifications/project-status";
import { assertCan } from "@/lib/rbac/can";
import { redact } from "@/lib/rbac/fields";
import { projectResource } from "@/lib/rbac/resources/project";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";
import type {
  AssignSurveyorInput,
  ChangeProjectStatusInput,
  ProjectInput,
  projectStatusEnum,
  UpdateProjectInput,
} from "./projects-schemas";

export type ProjectStatus = (typeof projectStatusEnum)["options"][number];

/**
 * PRD §3 Feature 2's status pipeline (Phase 3 review fix). This is the ONLY
 * source of truth for legal transitions — both `changeProjectStatusForUser`
 * (server enforcement) and the UI (`getAllowedNextStatuses`, so the status
 * control only offers legal choices) must go through it. Never duplicate
 * this table elsewhere.
 *
 * Forward pipeline: baru -> dijadwalkan -> data_diambil -> diproses -> selesai
 * - Any staff member (admin, or the surveyor assigned to the project) may
 *   move a project exactly ONE STEP FORWARD along that chain.
 * - Cancelling (any status -> dibatalkan) is OWNER ONLY.
 * - Moving backward one step, reopening (selesai -> diproses), and
 *   reactivating (dibatalkan -> baru) are OWNER ONLY.
 * - Everything else (skipping a step forward, staying on the same status)
 *   is rejected for everyone.
 */
const FORWARD_CHAIN: ProjectStatus[] = [
  "baru",
  "dijadwalkan",
  "data_diambil",
  "diproses",
  "selesai",
];

export function getAllowedNextStatuses(
  currentStatus: ProjectStatus,
  role: "admin" | "surveyor",
): ProjectStatus[] {
  const allowed = new Set<ProjectStatus>();
  const idx = FORWARD_CHAIN.indexOf(currentStatus);

  // Any staff member may move one step forward along the chain.
  if (idx !== -1 && idx + 1 < FORWARD_CHAIN.length) {
    allowed.add(FORWARD_CHAIN[idx + 1]);
  }

  if (role === "admin") {
    // Backward one step (also covers reopening `selesai` -> `diproses`).
    if (idx > 0) {
      allowed.add(FORWARD_CHAIN[idx - 1]);
    }
    // Reactivating a cancelled project.
    if (currentStatus === "dibatalkan") {
      allowed.add("baru");
    }
    // Cancelling from anywhere except an already-cancelled project.
    if (currentStatus !== "dibatalkan") {
      allowed.add("dibatalkan");
    }
  }

  return [...allowed];
}

/**
 * `notFound()`'s digest for this Next.js version (see
 * `next/dist/client/components/not-found.js`): `NEXT_HTTP_ERROR_FALLBACK;404`.
 * There is no stable public export to check this for a version this old, so
 * we match the digest directly. Only THIS error should be translated into a
 * generic "not found or no access" rejection — anything else (a genuine DB
 * failure, etc.) must propagate untouched.
 */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

/**
 * Server-only business logic for project CRUD + status pipeline, separated
 * from the "use server" action wrappers in `projects.ts` so it's directly
 * unit-testable (next-safe-action's request-scoped context isn't available in
 * plain vitest). Setiap fungsi menerima `RbacContext` dan menegakkan izin
 * sendiri lewat engine RBAC — `assertCan` untuk gerbang aksi, `requireScopedRow`
 * untuk scope baris.
 *
 * CRITICAL: fungsi yang membaca satu proyek tertentu WAJIB lewat
 * `requireScopedRow` — bukan `db.select()` mentah — itulah batas scoping baris
 * (surveyor hanya proyek yang ditugaskan padanya, klien hanya miliknya). Ia
 * memakai `rbacFilter` yang SAMA dengan jalur daftar, jadi keduanya mustahil
 * melenceng.
 */

function nullableText(value?: string): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createProjectForUser(ctx: RbacContext, input: ProjectInput) {
  assertCan(ctx, "project.create");
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(projects)
      .values({
        title: input.title,
        clientId: input.clientId,
        surveyType: input.surveyType,
        locationLabel: nullableText(input.locationLabel),
        assignedSurveyorId: nullableText(input.assignedSurveyorId),
        orderDate: input.orderDate ? new Date(input.orderDate) : undefined,
        description: nullableText(input.description),
      })
      .returning();
    await tx.insert(projectStatusLogs).values({
      projectId: inserted.id,
      fromStatus: null,
      toStatus: "baru",
      changedById: ctx.user.id,
    });
    return inserted;
  });
}

export async function updateProjectForUser(ctx: RbacContext, input: UpdateProjectInput) {
  assertCan(ctx, "project.update");
  const [project] = await db
    .update(projects)
    .set({
      title: input.title,
      clientId: input.clientId,
      surveyType: input.surveyType,
      locationLabel: nullableText(input.locationLabel),
      orderDate: input.orderDate ? new Date(input.orderDate) : undefined,
      description: nullableText(input.description),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.id))
    .returning();
  if (!project) throw new Error("Project not found.");
  return project;
}

export async function assignSurveyorForUser(ctx: RbacContext, input: AssignSurveyorInput) {
  assertCan(ctx, "project.assignSurveyor");

  const surveyorId = nullableText(input.surveyorId);
  if (surveyorId) {
    // Never trust a bare id: it must belong to an existing user with role
    // `surveyor`, otherwise a mistyped/other-role id (e.g. a client) could
    // be assigned to the project.
    const [targetUser] = await db.select().from(users).where(eq(users.id, surveyorId)).limit(1);
    if (targetUser?.role !== "surveyor") {
      throw new Error("Pengguna yang dipilih bukan surveyor yang valid.");
    }
  }

  const [project] = await db
    .update(projects)
    .set({ assignedSurveyorId: surveyorId, updatedAt: new Date() })
    .where(eq(projects.id, input.projectId))
    .returning();
  if (!project) throw new Error("Project not found.");
  return project;
}

/**
 * Allowed callers: admin, or the surveyor assigned to the project. Writes
 * the project's new status AND a `projectStatusLogs` row in the same
 * transaction, then emails the client (PRD §9).
 *
 * `notify` is injectable so tests can assert on the notification without
 * reaching Resend.
 */
export async function changeProjectStatusForUser(
  ctx: RbacContext,
  input: ChangeProjectStatusInput,
  notify: typeof notifyClientOfStatusChange = notifyClientOfStatusChange,
) {
  assertCan(ctx, "project.changeStatus");

  // `requireScopedRow` is the row-level scoping boundary: it 404s (via
  // `notFound()`) a surveyor who isn't assigned to this project, using the
  // SAME `rbacFilter` as the list path. We translate that not-found signal
  // into a plain rejection here rather than letting it escape a server action.
  let project: typeof projects.$inferSelect;
  try {
    project = (await requireScopedRow(
      ctx,
      "project.changeStatus",
      input.projectId,
    )) as typeof projects.$inferSelect;
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }

  // `assertCan("project.changeStatus")` above menjamin role staf (admin |
  // surveyor); klien tidak punya grant ini.
  const role = ctx.user.role as "admin" | "surveyor";
  const allowedNext = getAllowedNextStatuses(project.status as ProjectStatus, role);
  if (!allowedNext.includes(input.toStatus)) {
    const allowedText = allowedNext.length
      ? allowedNext.map((s) => statusLabel[s] ?? s).join(", ")
      : "tidak ada";
    throw new Error(
      `Transisi status dari "${statusLabel[project.status] ?? project.status}" ke "${
        statusLabel[input.toStatus] ?? input.toStatus
      }" tidak diizinkan. Status berikutnya yang diperbolehkan: ${allowedText}.`,
    );
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(projects)
      .set({ status: input.toStatus, updatedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning();
    await tx.insert(projectStatusLogs).values({
      projectId: project.id,
      fromStatus: project.status,
      toStatus: input.toStatus,
      changedById: ctx.user.id,
    });
    return row;
  });

  // Sengaja DI LUAR transaksi, dan sengaja ditelan.
  //
  // Notifikasi adalah efek samping, bukan bagian dari perubahan status. Kalau
  // dikirim di dalam transaksi, Resend yang lambat akan menahan lock baris
  // proyek; kalau errornya dibiarkan naik, Resend yang down membuat studio
  // tidak bisa memajukan status sama sekali — email gagal mengalahkan pekerjaan
  // sungguhan. Kegagalannya dicatat, statusnya tetap berubah.
  try {
    await notify({
      projectId: updated.id,
      projectTitle: updated.title,
      clientId: updated.clientId,
      fromStatus: project.status as ProjectStatus,
      toStatus: input.toStatus,
    });
  } catch (error) {
    console.error(`[notifikasi] gagal mengabari klien soal proyek ${updated.id}:`, error);
  }

  return updated;
}

export async function getStatusLogsForProject(projectId: string) {
  return db
    .select()
    .from(projectStatusLogs)
    .where(eq(projectStatusLogs.projectId, projectId))
    .orderBy(projectStatusLogs.createdAt);
}

type ProjectRow = typeof projects.$inferSelect;

/**
 * Baris proyek dengan kolom Keuangan Ringan (`projectValue` / `paymentStatus`
 * / `paymentNotes`) sebagai OPSIONAL: `redact` benar-benar membuang key-nya
 * dari objek untuk pemanggil tanpa `project.readFinance`, jadi tipenya jujur
 * bahwa key itu bisa tidak ada. Kolom lain tetap wajib.
 */
export type ProjectDetail = Omit<ProjectRow, "projectValue" | "paymentStatus" | "paymentNotes"> &
  Partial<Pick<ProjectRow, "projectValue" | "paymentStatus" | "paymentNotes">>;

/**
 * Sumber tunggal data proyek untuk halaman detail dashboard (regresi Phase 6+7
 * — CRITICAL). Baris diambil lewat `requireScopedRow` (scope baris = aturan
 * yang sama persis dengan daftar), lalu `redact` MEMBUANG kolom finance yang
 * `ctx` tak boleh lihat — bukan sekadar menyembunyikannya di UI. Untuk
 * pemanggil non-finance, `projectValue`/`paymentStatus`/`paymentNotes` benar-
 * benar tidak ada di objek, jadi tak bisa bocor ke payload RSC-nya. Dijaga
 * `project-detail.test.ts` (assertion key-absence).
 */
export async function getProjectDetailForUser(
  ctx: RbacContext,
  projectId: string,
): Promise<ProjectDetail> {
  const row = (await requireScopedRow(ctx, "project.read", projectId)) as ProjectRow;
  return redact(ctx, projectResource, row) as ProjectDetail;
}
