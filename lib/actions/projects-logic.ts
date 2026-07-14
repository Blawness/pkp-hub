import { eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projectStatusLogs, projects, users } from "@/lib/db/schema";
import { statusLabel } from "@/lib/labels";
import { notifyClientOfStatusChange } from "@/lib/notifications/project-status";
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
 * unit-testable (next-safe-action's `requireUser()` needs `next/headers`'
 * request scope, which plain vitest doesn't have). Every function re-checks
 * the caller's role/scoping itself — defense in depth alongside
 * `adminActionClient` / `staffActionClient` in `projects.ts`, not a
 * replacement for it.
 *
 * CRITICAL: any function here that reads a specific project MUST go through
 * `assertProjectAccess` — never a raw `db.select()` — that's the row-level
 * scoping boundary (surveyor sees only their assigned projects, client sees
 * only their own).
 */

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Only the admin can perform this action.");
  }
}

function requireStaff(user: SessionUser) {
  if (user.role !== "admin" && user.role !== "surveyor") {
    throw new Error("You do not have permission to perform this action.");
  }
}

function nullableText(value?: string): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createProjectForUser(user: SessionUser, input: ProjectInput) {
  requireAdmin(user);
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
      changedById: user.id,
    });
    return inserted;
  });
}

export async function updateProjectForUser(user: SessionUser, input: UpdateProjectInput) {
  requireAdmin(user);
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

export async function assignSurveyorForUser(user: SessionUser, input: AssignSurveyorInput) {
  requireAdmin(user);

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
  user: SessionUser,
  input: ChangeProjectStatusInput,
  notify: typeof notifyClientOfStatusChange = notifyClientOfStatusChange,
) {
  requireStaff(user);

  // `assertProjectAccess` is the row-level scoping boundary: it throws
  // (via `notFound()`) if a surveyor isn't assigned to this project. We
  // translate that into a plain rejection here rather than letting Next's
  // not-found signal escape a server action.
  let project: Awaited<ReturnType<typeof assertProjectAccess>>;
  try {
    project = await assertProjectAccess(input.projectId, user);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }

  // `requireStaff` above guarantees role is "admin" | "surveyor".
  const role = user.role as "admin" | "surveyor";
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
      changedById: user.id,
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

/**
 * Non-finance fields of a project, safe to hand to ANY staff role.
 */
export type ProjectDetailBase = {
  id: string;
  title: string;
  clientId: string;
  surveyType: string;
  locationLabel: string | null;
  assignedSurveyorId: string | null;
  status: string;
  orderDate: Date;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Admin-only view: adds the Keuangan Ringan fields. */
export type ProjectDetailForAdmin = ProjectDetailBase & {
  projectValue: number | null;
  paymentStatus: string;
  paymentNotes: string | null;
};

export type ProjectDetail = ProjectDetailForAdmin | ProjectDetailBase;

/**
 * The project detail dashboard page's ONLY source for project data
 * (Phase 6+7 review fix — CRITICAL). Like `dashboard-logic.ts`'s
 * `getSurveyorDashboardData`, this builds its return value as an explicit
 * field-by-field projection and NEVER spreads the raw `assertProjectAccess`
 * row: `projectValue` / `paymentStatus` / `paymentNotes` are only ever
 * copied onto the returned object when `user.role === "admin"`. For any
 * other role those keys are simply never present on the object — not
 * hidden by a client-side conditional, not present-but-unused — so they
 * cannot leak into a non-admin's RSC payload no matter what the page does
 * with the result. Enforced by `project-detail.test.ts`'s key-absence
 * assertion, the exact regression test for this finding.
 */
export async function getProjectDetailForUser(
  user: SessionUser,
  projectId: string,
): Promise<ProjectDetail> {
  const project = await assertProjectAccess(projectId, user);

  const base: ProjectDetailBase = {
    id: project.id,
    title: project.title,
    clientId: project.clientId,
    surveyType: project.surveyType,
    locationLabel: project.locationLabel,
    assignedSurveyorId: project.assignedSurveyorId,
    status: project.status,
    orderDate: project.orderDate,
    description: project.description,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };

  if (user.role !== "admin") {
    return base;
  }

  return {
    ...base,
    projectValue: project.projectValue,
    paymentStatus: project.paymentStatus,
    paymentNotes: project.paymentNotes,
  };
}
