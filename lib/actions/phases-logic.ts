import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CreatePhaseInput,
  DeletePhaseInput,
  ReorderPhasesInput,
  SetPhaseStatusInput,
  UpdatePhaseInput,
  UpdatePhaseNoteInput,
} from "@/lib/actions/phases-schemas";
import { db } from "@/lib/db";
import { projectPhases } from "@/lib/db/schema";
import { calculateProgress, completedAtFor, nextSortOrder, resequence } from "@/lib/phases/derive";
import { assertCan } from "@/lib/rbac/can";
import type { ScopedPermission } from "@/lib/rbac/resources";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Timeline fase (spec 2026-07-14). Logika + guard dipisah dari pembungkus
 * "use server" di `phases.ts` supaya bisa diuji langsung (`phases.test.ts`),
 * pola yang sama dengan `payments-logic.ts`.
 *
 * PEMBAGIAN HAK: admin memegang RENCANA (buat/hapus/susun/bobot/target),
 * surveyor melaporkan PEKERJAAN (status + catatan). Ditegakkan lewat engine
 * RBAC — `phase.create/update/delete/reorder` admin-only, `phase.setStatus`/
 * `.updateNote` juga untuk surveyor ber-akses. Kalau surveyor bisa menyusun
 * ulang atau mengubah bobot, persen progres berhenti berarti apa pun.
 */

export type PhaseRow = typeof projectPhases.$inferSelect;

/** Sama seperti `payments-logic.ts`: ubah sinyal 404 `notFound()` jadi penolakan biasa. */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

/** Verifikasi `ctx` boleh mengakses proyek ini; 404 → penolakan biasa. */
async function requireProjectReadOrReject(ctx: RbacContext, projectId: string) {
  try {
    return await requireScopedRow(ctx, "project.read", projectId);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Proyek tidak ditemukan atau kamu tidak punya akses.");
    }
    throw error;
  }
}

/** Ambil satu fase yang boleh disentuh `ctx` untuk `permission`; 404 → penolakan. */
async function requireScopedPhaseOrReject(
  ctx: RbacContext,
  permission: ScopedPermission,
  phaseId: string,
): Promise<PhaseRow> {
  try {
    return (await requireScopedRow(ctx, permission, phaseId)) as PhaseRow;
  } catch (error) {
    if (isNotFoundDigest(error)) throw new Error("Fase tidak ditemukan.");
    throw error;
  }
}

/** Klien BOLEH memanggil ini — pemangkasan field internal terjadi di lapisan portal. */
export async function listPhasesForProject(
  ctx: RbacContext,
  projectId: string,
): Promise<PhaseRow[]> {
  await requireProjectReadOrReject(ctx, projectId);
  return db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sortOrder));
}

export async function getProjectProgress(
  ctx: RbacContext,
  projectId: string,
): Promise<number | null> {
  const phases = await listPhasesForProject(ctx, projectId);
  return calculateProgress(phases);
}

export async function createPhaseForUser(
  ctx: RbacContext,
  input: CreatePhaseInput,
): Promise<PhaseRow> {
  assertCan(ctx, "phase.create");
  await requireProjectReadOrReject(ctx, input.projectId);

  const existing = await db
    .select({ sortOrder: projectPhases.sortOrder })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, input.projectId));

  const [row] = await db
    .insert(projectPhases)
    .values({
      projectId: input.projectId,
      name: input.name,
      description: input.description?.length ? input.description : null,
      weight: input.weight,
      assignedSurveyorId: input.assignedSurveyorId ?? null,
      targetDate: input.targetDate ?? null,
      sortOrder: nextSortOrder(existing),
    })
    .returning();

  return row;
}

export async function updatePhaseForUser(
  ctx: RbacContext,
  input: UpdatePhaseInput,
): Promise<PhaseRow> {
  assertCan(ctx, "phase.update");
  await requireScopedPhaseOrReject(ctx, "phase.update", input.phaseId);

  const [row] = await db
    .update(projectPhases)
    .set({
      name: input.name,
      description: input.description?.length ? input.description : null,
      weight: input.weight,
      assignedSurveyorId: input.assignedSurveyorId ?? null,
      targetDate: input.targetDate ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projectPhases.id, input.phaseId))
    .returning();

  return row;
}

/** Admin ATAU surveyor ber-akses. `completedAt` diurus `completedAtFor`, bukan pemanggil. */
export async function setPhaseStatusForUser(
  ctx: RbacContext,
  input: SetPhaseStatusInput,
): Promise<PhaseRow> {
  assertCan(ctx, "phase.setStatus");
  const phase = await requireScopedPhaseOrReject(ctx, "phase.setStatus", input.phaseId);

  const [row] = await db
    .update(projectPhases)
    .set({
      status: input.status,
      completedAt: completedAtFor(input.status, new Date(), phase.completedAt),
      updatedAt: new Date(),
    })
    .where(eq(projectPhases.id, input.phaseId))
    .returning();

  return row;
}

export async function updatePhaseNoteForUser(
  ctx: RbacContext,
  input: UpdatePhaseNoteInput,
): Promise<PhaseRow> {
  assertCan(ctx, "phase.updateNote");
  await requireScopedPhaseOrReject(ctx, "phase.updateNote", input.phaseId);

  const [row] = await db
    .update(projectPhases)
    .set({
      description: input.description.length ? input.description : null,
      updatedAt: new Date(),
    })
    .where(eq(projectPhases.id, input.phaseId))
    .returning();

  return row;
}

export async function deletePhaseForUser(
  ctx: RbacContext,
  input: DeletePhaseInput,
): Promise<{ projectId: string }> {
  assertCan(ctx, "phase.delete");
  const phase = await requireScopedPhaseOrReject(ctx, "phase.delete", input.phaseId);

  await db.delete(projectPhases).where(eq(projectPhases.id, input.phaseId));
  return { projectId: phase.projectId };
}

/**
 * Susun ulang SELURUH fase proyek dalam satu transaksi. `orderedPhaseIds` harus
 * memuat SEMUA fase proyek itu — menerima daftar sebagian akan meninggalkan
 * `sortOrder` kembar di fase yang tidak disebut.
 */
export async function reorderPhasesForUser(
  ctx: RbacContext,
  input: ReorderPhasesInput,
): Promise<PhaseRow[]> {
  assertCan(ctx, "phase.reorder");
  await requireProjectReadOrReject(ctx, input.projectId);

  const current = await db
    .select({ id: projectPhases.id })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, input.projectId));

  const currentIds = new Set(current.map((p) => p.id));
  const givenIds = new Set(input.orderedPhaseIds);
  const sameSize = currentIds.size === givenIds.size;
  const allKnown = input.orderedPhaseIds.every((id) => currentIds.has(id));
  if (!sameSize || !allKnown) {
    throw new Error("Daftar urutan harus lengkap: memuat semua fase proyek ini, tepat satu kali.");
  }

  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of resequence(input.orderedPhaseIds)) {
      await tx
        .update(projectPhases)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(projectPhases.id, id), eq(projectPhases.projectId, input.projectId)));
    }
  });

  return db
    .select()
    .from(projectPhases)
    .where(inArray(projectPhases.id, input.orderedPhaseIds))
    .orderBy(asc(projectPhases.sortOrder));
}
