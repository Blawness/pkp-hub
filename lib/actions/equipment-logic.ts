import { and, desc, eq, isNull } from "drizzle-orm";
import type {
  ArchiveEquipmentInput,
  BorrowEquipmentInput,
  CorrectUsageInput,
  CreateEquipmentInput,
  ReturnEquipmentInput,
  UpdateEquipmentInput,
} from "@/lib/actions/equipment-schemas";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { equipment, equipmentUsage, projects, users } from "@/lib/db/schema";
import {
  borrowRejection,
  type EquipmentCondition,
  validateUsageWindow,
} from "@/lib/equipment/derive";
import { storage } from "@/lib/storage";

/**
 * Inventaris alat (spec 2026-07-14). Logika + guard dipisah dari pembungkus
 * "use server" (`equipment.ts`) supaya bisa diuji langsung — pola
 * `payments-logic.ts`.
 *
 * DUA ATURAN YANG MUDAH DILANGGAR TANPA SADAR:
 *
 * 1. `purchasePrice`/`purchaseDate` TIDAK BOLEH sampai ke surveyor. Karena itu
 *    query untuk non-admin memilih kolom secara eksplisit — jangan sekali-kali
 *    ganti jadi `db.select().from(equipment)`, itu mengirim semuanya.
 * 2. `usedById` untuk surveyor SELALU dipaksa jadi id dirinya di server. Form
 *    yang tidak merender pilihannya bukan penegakan.
 */

export type EquipmentRow = {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  condition: EquipmentCondition;
  image: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EquipmentRowSafe = Omit<EquipmentRow, "purchaseDate" | "purchasePrice">;

export type ActiveUsage = {
  usageId: string;
  usedById: string;
  usedByName: string;
  projectId: string;
  projectTitle: string;
  startedAt: Date;
};

export type EquipmentListItem = (EquipmentRow | EquipmentRowSafe) & {
  activeUsage: ActiveUsage | null;
};

export type UsageRow = {
  id: string;
  equipmentId: string;
  projectId: string;
  usedById: string;
  startedAt: Date;
  endedAt: Date | null;
  note: string | null;
  recordedById: string;
  createdAt: Date;
};

function requireStaff(user: SessionUser) {
  if (user.role === "client") {
    throw new Error("Inventaris alat hanya untuk staf studio.");
  }
}

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Hanya admin yang bisa mengelola data alat.");
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
      throw new Error("Proyek tidak ditemukan atau Anda tidak punya akses.");
    }
    throw error;
  }
}

const adminColumns = {
  id: equipment.id,
  name: equipment.name,
  category: equipment.category,
  serialNumber: equipment.serialNumber,
  condition: equipment.condition,
  image: equipment.image,
  purchaseDate: equipment.purchaseDate,
  purchasePrice: equipment.purchasePrice,
  notes: equipment.notes,
  archivedAt: equipment.archivedAt,
  createdAt: equipment.createdAt,
  updatedAt: equipment.updatedAt,
};

const safeColumns = {
  id: equipment.id,
  name: equipment.name,
  category: equipment.category,
  serialNumber: equipment.serialNumber,
  condition: equipment.condition,
  image: equipment.image,
  notes: equipment.notes,
  archivedAt: equipment.archivedAt,
  createdAt: equipment.createdAt,
  updatedAt: equipment.updatedAt,
};

/** Sesi aktif (`endedAt IS NULL`) untuk setiap `equipmentId`, keyed by id. */
async function activeUsageByEquipmentId(): Promise<Map<string, ActiveUsage>> {
  const rows = await db
    .select({
      usageId: equipmentUsage.id,
      equipmentId: equipmentUsage.equipmentId,
      usedById: equipmentUsage.usedById,
      usedByName: users.name,
      projectId: equipmentUsage.projectId,
      projectTitle: projects.title,
      startedAt: equipmentUsage.startedAt,
    })
    .from(equipmentUsage)
    .innerJoin(users, eq(equipmentUsage.usedById, users.id))
    .innerJoin(projects, eq(equipmentUsage.projectId, projects.id))
    .where(isNull(equipmentUsage.endedAt));

  const map = new Map<string, ActiveUsage>();
  for (const row of rows) {
    map.set(row.equipmentId, {
      usageId: row.usageId,
      usedById: row.usedById,
      usedByName: row.usedByName,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      startedAt: row.startedAt,
    });
  }
  return map;
}

/** Admin: seluruh kolom termasuk harga & tanggal beli. Surveyor: TANPA keduanya. */
export async function listEquipmentForUser(user: SessionUser): Promise<EquipmentListItem[]> {
  requireStaff(user);

  const activeMap = await activeUsageByEquipmentId();

  if (user.role === "admin") {
    const rows = await db
      .select(adminColumns)
      .from(equipment)
      .where(isNull(equipment.archivedAt))
      .orderBy(desc(equipment.createdAt));
    return rows.map((row) => ({ ...row, activeUsage: activeMap.get(row.id) ?? null }));
  }

  const rows = await db
    .select(safeColumns)
    .from(equipment)
    .where(isNull(equipment.archivedAt))
    .orderBy(desc(equipment.createdAt));
  return rows.map((row) => ({ ...row, activeUsage: activeMap.get(row.id) ?? null }));
}

export async function getEquipmentForUser(
  user: SessionUser,
  equipmentId: string,
): Promise<EquipmentListItem> {
  requireStaff(user);

  const columns = user.role === "admin" ? adminColumns : safeColumns;
  const [row] = await db.select(columns).from(equipment).where(eq(equipment.id, equipmentId));
  if (!row) throw new Error("Alat tidak ditemukan.");

  const [activeRow] = await db
    .select({
      usageId: equipmentUsage.id,
      usedById: equipmentUsage.usedById,
      usedByName: users.name,
      projectId: equipmentUsage.projectId,
      projectTitle: projects.title,
      startedAt: equipmentUsage.startedAt,
    })
    .from(equipmentUsage)
    .innerJoin(users, eq(equipmentUsage.usedById, users.id))
    .innerJoin(projects, eq(equipmentUsage.projectId, projects.id))
    .where(and(eq(equipmentUsage.equipmentId, equipmentId), isNull(equipmentUsage.endedAt)));

  const activeUsage: ActiveUsage | null = activeRow
    ? {
        usageId: activeRow.usageId,
        usedById: activeRow.usedById,
        usedByName: activeRow.usedByName,
        projectId: activeRow.projectId,
        projectTitle: activeRow.projectTitle,
        startedAt: activeRow.startedAt,
      }
    : null;

  return { ...row, activeUsage };
}

/** Riwayat pakai untuk satu alat, terbaru dulu. */
export async function listUsageForEquipment(
  user: SessionUser,
  equipmentId: string,
): Promise<UsageRow[]> {
  requireStaff(user);
  return db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.equipmentId, equipmentId))
    .orderBy(desc(equipmentUsage.startedAt));
}

/**
 * Riwayat pakai untuk satu proyek. `assertProjectAccess` di sini adalah yang
 * membuat surveyor cuma melihat riwayat alat di proyeknya sendiri.
 */
export async function listUsageForProject(
  user: SessionUser,
  projectId: string,
): Promise<UsageRow[]> {
  requireStaff(user);
  await assertProjectAccessOrReject(projectId, user);
  return db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.projectId, projectId))
    .orderBy(desc(equipmentUsage.startedAt));
}

export async function createEquipmentForUser(
  user: SessionUser,
  input: CreateEquipmentInput,
): Promise<EquipmentRow> {
  requireAdmin(user);

  const [row] = await db
    .insert(equipment)
    .values({
      name: input.name,
      category: input.category,
      serialNumber: input.serialNumber && input.serialNumber.length > 0 ? input.serialNumber : null,
      condition: input.condition,
      image: input.image && input.image.length > 0 ? input.image : null,
      purchaseDate: input.purchaseDate ?? null,
      purchasePrice: input.purchasePrice ?? null,
      notes: input.notes && input.notes.length > 0 ? input.notes : null,
    })
    .returning(adminColumns);
  return row;
}

/**
 * Hapus objek gambar lama saat diganti/dihapus — best-effort. Kegagalan
 * menghapus (objek sudah tak ada, URL dari driver lain, dll.) tidak boleh
 * menggagalkan operasi utama; sisa orphan lebih ringan daripada update gagal.
 */
async function deleteImageObject(fileUrl: string): Promise<void> {
  try {
    await storage.delete(storage.keyFromUrl(fileUrl));
  } catch {
    // abaikan
  }
}

export async function updateEquipmentForUser(
  user: SessionUser,
  input: UpdateEquipmentInput,
): Promise<EquipmentRow> {
  requireAdmin(user);

  const [existing] = await db
    .select({ image: equipment.image })
    .from(equipment)
    .where(eq(equipment.id, input.equipmentId));
  if (!existing) throw new Error("Alat tidak ditemukan.");

  const nextImage = input.image && input.image.length > 0 ? input.image : null;

  const [row] = await db
    .update(equipment)
    .set({
      name: input.name,
      category: input.category,
      serialNumber: input.serialNumber && input.serialNumber.length > 0 ? input.serialNumber : null,
      condition: input.condition,
      image: nextImage,
      purchaseDate: input.purchaseDate ?? null,
      purchasePrice: input.purchasePrice ?? null,
      notes: input.notes && input.notes.length > 0 ? input.notes : null,
      updatedAt: new Date(),
    })
    .where(eq(equipment.id, input.equipmentId))
    .returning(adminColumns);
  if (!row) throw new Error("Alat tidak ditemukan.");

  // Gambar lama jadi orphan kalau diganti/dihapus — bersihkan best-effort.
  if (existing.image && existing.image !== nextImage) {
    await deleteImageObject(existing.image);
  }
  return row;
}

export async function archiveEquipmentForUser(
  user: SessionUser,
  input: ArchiveEquipmentInput,
): Promise<EquipmentRow> {
  requireAdmin(user);

  const [row] = await db
    .update(equipment)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(equipment.id, input.equipmentId))
    .returning(adminColumns);
  if (!row) throw new Error("Alat tidak ditemukan.");
  return row;
}

/**
 * Deteksi error dari partial unique index `equipment_active_usage_uniq`
 * (Postgres code 23505) dan terjemahkan jadi pesan yang enak dibaca. Ini
 * BUKAN pertahanan utamanya — index-nya sudah menegakkan itu — ini cuma
 * penerjemah.
 */
function isActiveUsageUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the real pg error in `DrizzleQueryError.cause` — the code
  // (and the constraint name in the message) live there, not on the
  // top-level error.
  const direct = (error as { code?: unknown } | null)?.code;
  if (direct === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const causeCode = (cause as { code?: unknown } | null)?.code;
  return causeCode === "23505";
}

/** Staf. Mencatat sesi pinjam baru. */
export async function borrowEquipmentForUser(
  user: SessionUser,
  input: BorrowEquipmentInput,
): Promise<UsageRow> {
  requireStaff(user);
  await assertProjectAccessOrReject(input.projectId, user);

  // Paksa: surveyor tidak pernah bisa mencatat alat di tangan orang lain.
  const usedById = user.role === "admin" ? (input.usedById ?? user.id) : user.id;

  // Kolom eksplisit: `borrowRejection` hanya butuh `condition`/`archivedAt`.
  // Ini dipanggil surveyor lewat `staffActionClient` — `purchasePrice`/
  // `purchaseDate` (admin-only) tidak boleh sampai ke memori server di sini.
  const [item] = await db
    .select({ id: equipment.id, condition: equipment.condition, archivedAt: equipment.archivedAt })
    .from(equipment)
    .where(eq(equipment.id, input.equipmentId));
  if (!item) throw new Error("Alat tidak ditemukan.");

  const [activeSession] = await db
    .select({ id: equipmentUsage.id })
    .from(equipmentUsage)
    .where(and(eq(equipmentUsage.equipmentId, input.equipmentId), isNull(equipmentUsage.endedAt)));

  const rejection = borrowRejection(item, Boolean(activeSession));
  if (rejection) throw new Error(rejection);

  const windowError = validateUsageWindow(input.startedAt, null, new Date());
  if (windowError) throw new Error(windowError);

  try {
    const [row] = await db
      .insert(equipmentUsage)
      .values({
        equipmentId: input.equipmentId,
        projectId: input.projectId,
        usedById,
        startedAt: input.startedAt,
        note: input.note && input.note.length > 0 ? input.note : null,
        recordedById: user.id,
      })
      .returning();
    return row;
  } catch (error) {
    if (isActiveUsageUniqueViolation(error)) {
      throw new Error("Alat sedang dipakai orang lain.");
    }
    throw error;
  }
}

/** Staf. Menutup sesi pakai. Surveyor hanya boleh menutup sesinya sendiri. */
export async function returnEquipmentForUser(
  user: SessionUser,
  input: ReturnEquipmentInput,
): Promise<UsageRow> {
  requireStaff(user);

  const [session] = await db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.id, input.usageId));
  if (!session) throw new Error("Sesi pakai tidak ditemukan.");
  if (session.endedAt) throw new Error("Sesi pakai ini sudah ditutup.");

  if (user.role === "surveyor" && session.usedById !== user.id) {
    throw new Error("Anda hanya bisa mengembalikan alat yang Anda pegang sendiri.");
  }

  const endedAt = input.endedAt ?? new Date();
  const windowError = validateUsageWindow(session.startedAt, endedAt, new Date());
  if (windowError) throw new Error(windowError);

  const [row] = await db
    .update(equipmentUsage)
    .set({
      endedAt,
      note: input.note && input.note.length > 0 ? input.note : session.note,
    })
    .where(eq(equipmentUsage.id, input.usageId))
    .returning();
  return row;
}

/** Admin-only. Mengoreksi jam mulai/selesai sesi yang sudah ditutup. */
export async function correctUsageForUser(
  user: SessionUser,
  input: CorrectUsageInput,
): Promise<UsageRow> {
  requireAdmin(user);

  const [session] = await db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.id, input.usageId));
  if (!session) throw new Error("Sesi pakai tidak ditemukan.");

  const windowError = validateUsageWindow(input.startedAt, input.endedAt, new Date());
  if (windowError) throw new Error(windowError);

  const [row] = await db
    .update(equipmentUsage)
    .set({
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      note: input.note && input.note.length > 0 ? input.note : session.note,
    })
    .where(eq(equipmentUsage.id, input.usageId))
    .returning();
  return row;
}
