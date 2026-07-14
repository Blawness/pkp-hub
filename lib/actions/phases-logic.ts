import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CreatePhaseInput,
  DeletePhaseInput,
  ReorderPhasesInput,
  SetPhaseStatusInput,
  UpdatePhaseInput,
  UpdatePhaseNoteInput,
} from "@/lib/actions/phases-schemas";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projectPhases } from "@/lib/db/schema";
import { calculateProgress, completedAtFor, nextSortOrder, resequence } from "@/lib/phases/derive";

/**
 * Timeline fase (spec 2026-07-14). Logika + guard dipisah dari pembungkus
 * "use server" di `phases.ts` supaya bisa diuji langsung (`phases.test.ts`),
 * pola yang sama dengan `payments-logic.ts`.
 *
 * PEMBAGIAN HAK: admin memegang RENCANA (buat/hapus/susun/bobot/target),
 * surveyor melaporkan PEKERJAAN (status + catatan). Kalau surveyor bisa
 * menyusun ulang atau mengubah bobot, persen progres berhenti berarti apa pun —
 * orang yang dinilai olehnya juga yang menyusunnya.
 */

export type PhaseRow = typeof projectPhases.$inferSelect;

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Hanya admin yang bisa mengelola fase proyek.");
  }
}

/** Sama seperti `payments-logic.ts`: ubah sinyal 404 `notFound()` jadi penolakan biasa. */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function assertProjectAccessOrReject(projectId: string, user: SessionUser) {
  try {
    return await assertProjectAccess(projectId, user);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Proyek tidak ditemukan atau kamu tidak punya akses.");
    }
    throw error;
  }
}

/** Ambil fase + pastikan pemanggil boleh menyentuh proyeknya. */
async function loadPhaseWithAccess(phaseId: string, user: SessionUser): Promise<PhaseRow> {
  const [phase] = await db.select().from(projectPhases).where(eq(projectPhases.id, phaseId));
  if (!phase) throw new Error("Fase tidak ditemukan.");
  await assertProjectAccessOrReject(phase.projectId, user);
  return phase;
}

/** Klien BOLEH memanggil ini — pemangkasan field internal terjadi di lapisan portal. */
export async function listPhasesForProject(
  user: SessionUser,
  projectId: string,
): Promise<PhaseRow[]> {
  await assertProjectAccessOrReject(projectId, user);
  return db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sortOrder));
}

export async function getProjectProgress(
  user: SessionUser,
  projectId: string,
): Promise<number | null> {
  const phases = await listPhasesForProject(user, projectId);
  return calculateProgress(phases);
}

export async function createPhaseForUser(
  user: SessionUser,
  input: CreatePhaseInput,
): Promise<PhaseRow> {
  requireAdmin(user);
  await assertProjectAccessOrReject(input.projectId, user);

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
  user: SessionUser,
  input: UpdatePhaseInput,
): Promise<PhaseRow> {
  requireAdmin(user);
  await loadPhaseWithAccess(input.phaseId, user);

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
  user: SessionUser,
  input: SetPhaseStatusInput,
): Promise<PhaseRow> {
  const phase = await loadPhaseWithAccess(input.phaseId, user);
  if (user.role === "client") {
    throw new Error("Klien tidak bisa mengubah status fase.");
  }

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
  user: SessionUser,
  input: UpdatePhaseNoteInput,
): Promise<PhaseRow> {
  await loadPhaseWithAccess(input.phaseId, user);
  if (user.role === "client") {
    throw new Error("Klien tidak bisa mengubah catatan fase.");
  }

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
  user: SessionUser,
  input: DeletePhaseInput,
): Promise<{ projectId: string }> {
  requireAdmin(user);
  const phase = await loadPhaseWithAccess(input.phaseId, user);

  await db.delete(projectPhases).where(eq(projectPhases.id, input.phaseId));
  return { projectId: phase.projectId };
}

/**
 * Susun ulang SELURUH fase proyek dalam satu transaksi. `orderedPhaseIds` harus
 * memuat SEMUA fase proyek itu — menerima daftar sebagian akan meninggalkan
 * `sortOrder` kembar di fase yang tidak disebut.
 */
export async function reorderPhasesForUser(
  user: SessionUser,
  input: ReorderPhasesInput,
): Promise<PhaseRow[]> {
  requireAdmin(user);
  await assertProjectAccessOrReject(input.projectId, user);

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
