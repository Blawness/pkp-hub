import { and, desc, eq, isNull } from "drizzle-orm";
import type {
  ArchiveEquipmentInput,
  BorrowEquipmentInput,
  CorrectUsageInput,
  CreateEquipmentInput,
  ReturnEquipmentInput,
  UpdateEquipmentInput,
} from "@/lib/actions/equipment-schemas";
import { db } from "@/lib/db";
import { equipment, equipmentItem, equipmentUsage, projects, users } from "@/lib/db/schema";
import {
  borrowRejection,
  type EquipmentCondition,
  validateUsageWindow,
} from "@/lib/equipment/derive";
import { assertCan, can } from "@/lib/rbac/can";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Inventaris alat — UNIT FISIK (spec 2026-07-14, direvisi spec 2026-07-16).
 * Logika + guard dipisah dari pembungkus "use server" (`equipment.ts`) supaya
 * bisa diuji langsung — pola `payments-logic.ts`. Jenis alat (`equipmentItem`)
 * ada di `equipment-items-logic.ts`, file terpisah.
 *
 * DUA ATURAN YANG MUDAH DILANGGAR TANPA SADAR:
 *
 * 1. `purchasePrice`/`purchaseDate` TIDAK BOLEH sampai ke surveyor. Karena
 *    query-nya adalah JOIN (equipment + equipmentItem), pilihan kolom disetir
 *    `can(ctx, "equipment.readCost")` (admin punya, surveyor tidak) — bukan
 *    `db.select().from(equipment)` yang mengirim semuanya. Ini penerapan
 *    `fields` resource equipment (lihat `lib/rbac/resources/equipment.ts`) untuk
 *    bentuk join yang tidak muat di `scopedColumns` satu-tabel.
 * 2. `usedById` untuk surveyor SELALU dipaksa jadi id dirinya di server. Form
 *    yang tidak merender pilihannya bukan penegakan.
 */

export type EquipmentRow = {
  id: string;
  itemId: string;
  itemName: string;
  category: string;
  image: string | null;
  code: string;
  serialNumber: string | null;
  condition: EquipmentCondition;
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
      throw new Error("Proyek tidak ditemukan atau Anda tidak punya akses.");
    }
    throw error;
  }
}

const adminColumns = {
  id: equipment.id,
  itemId: equipment.itemId,
  itemName: equipmentItem.name,
  category: equipmentItem.category,
  image: equipmentItem.image,
  code: equipment.code,
  serialNumber: equipment.serialNumber,
  condition: equipment.condition,
  purchaseDate: equipment.purchaseDate,
  purchasePrice: equipment.purchasePrice,
  notes: equipment.notes,
  archivedAt: equipment.archivedAt,
  createdAt: equipment.createdAt,
  updatedAt: equipment.updatedAt,
};

const safeColumns = {
  id: equipment.id,
  itemId: equipment.itemId,
  itemName: equipmentItem.name,
  category: equipmentItem.category,
  image: equipmentItem.image,
  code: equipment.code,
  serialNumber: equipment.serialNumber,
  condition: equipment.condition,
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

/** Admin: seluruh kolom termasuk harga & tanggal beli. Surveyor: TANPA keduanya. Baris terarsip tidak ikut — dikelompokkan per jenis di `equipment-items-logic.ts`. */
export async function listEquipmentForUser(ctx: RbacContext): Promise<EquipmentListItem[]> {
  assertCan(ctx, "equipment.read");

  const activeMap = await activeUsageByEquipmentId();

  // Kolom harga/tanggal beli hanya untuk pemegang `equipment.readCost` (admin);
  // untuk surveyor keduanya TIDAK ikut ter-SELECT.
  const columns = can(ctx, "equipment.readCost") ? adminColumns : safeColumns;
  const rows = await db
    .select(columns)
    .from(equipment)
    .innerJoin(equipmentItem, eq(equipment.itemId, equipmentItem.id))
    .where(isNull(equipment.archivedAt))
    .orderBy(desc(equipment.createdAt));
  return rows.map((row) => ({ ...row, activeUsage: activeMap.get(row.id) ?? null }));
}

export async function getEquipmentForUser(
  ctx: RbacContext,
  equipmentId: string,
): Promise<EquipmentListItem> {
  assertCan(ctx, "equipment.read");

  const columns = can(ctx, "equipment.readCost") ? adminColumns : safeColumns;
  const [row] = await db
    .select(columns)
    .from(equipment)
    .innerJoin(equipmentItem, eq(equipment.itemId, equipmentItem.id))
    .where(eq(equipment.id, equipmentId));
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
  ctx: RbacContext,
  equipmentId: string,
): Promise<UsageRow[]> {
  assertCan(ctx, "equipment.read");
  return db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.equipmentId, equipmentId))
    .orderBy(desc(equipmentUsage.startedAt));
}

/**
 * Riwayat pakai untuk satu proyek. `requireProjectReadOrReject` di sini yang
 * membuat surveyor cuma melihat riwayat alat di proyeknya sendiri.
 */
export async function listUsageForProject(
  ctx: RbacContext,
  projectId: string,
): Promise<UsageRow[]> {
  assertCan(ctx, "equipment.read");
  await requireProjectReadOrReject(ctx, projectId);
  return db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.projectId, projectId))
    .orderBy(desc(equipmentUsage.startedAt));
}

/** Deteksi error dari unique index `equipment_code_uniq` (Postgres code 23505) dan terjemahkan jadi pesan yang enak dibaca. */
function isCodeUniqueViolation(error: unknown): boolean {
  const direct = (error as { code?: unknown } | null)?.code;
  if (direct === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const causeCode = (cause as { code?: unknown } | null)?.code;
  return causeCode === "23505";
}

export async function createEquipmentForUser(
  ctx: RbacContext,
  input: CreateEquipmentInput,
): Promise<EquipmentRow> {
  assertCan(ctx, "equipment.create");

  const [item] = await db
    .select({
      id: equipmentItem.id,
      name: equipmentItem.name,
      category: equipmentItem.category,
      image: equipmentItem.image,
    })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, input.itemId));
  if (!item) throw new Error("Jenis alat tidak ditemukan.");

  try {
    const [row] = await db
      .insert(equipment)
      .values({
        itemId: input.itemId,
        code: input.code,
        serialNumber:
          input.serialNumber && input.serialNumber.length > 0 ? input.serialNumber : null,
        condition: input.condition,
        purchaseDate: input.purchaseDate ?? null,
        purchasePrice: input.purchasePrice ?? null,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
      })
      .returning();
    return { ...row, itemName: item.name, category: item.category, image: item.image };
  } catch (error) {
    if (isCodeUniqueViolation(error)) {
      throw new Error("Kode unit sudah dipakai — pakai kode lain.");
    }
    throw error;
  }
}

export async function updateEquipmentForUser(
  ctx: RbacContext,
  input: UpdateEquipmentInput,
): Promise<EquipmentRow> {
  assertCan(ctx, "equipment.update");

  const [existing] = await db
    .select({ itemId: equipment.itemId })
    .from(equipment)
    .where(eq(equipment.id, input.equipmentId));
  if (!existing) throw new Error("Alat tidak ditemukan.");

  const [item] = await db
    .select({
      name: equipmentItem.name,
      category: equipmentItem.category,
      image: equipmentItem.image,
    })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, existing.itemId));

  try {
    const [row] = await db
      .update(equipment)
      .set({
        code: input.code,
        serialNumber:
          input.serialNumber && input.serialNumber.length > 0 ? input.serialNumber : null,
        condition: input.condition,
        purchaseDate: input.purchaseDate ?? null,
        purchasePrice: input.purchasePrice ?? null,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
        updatedAt: new Date(),
      })
      .where(eq(equipment.id, input.equipmentId))
      .returning();
    if (!row) throw new Error("Alat tidak ditemukan.");
    return { ...row, itemName: item.name, category: item.category, image: item.image };
  } catch (error) {
    if (isCodeUniqueViolation(error)) {
      throw new Error("Kode unit sudah dipakai — pakai kode lain.");
    }
    throw error;
  }
}

export async function archiveEquipmentForUser(
  ctx: RbacContext,
  input: ArchiveEquipmentInput,
): Promise<EquipmentRow> {
  assertCan(ctx, "equipment.archive");

  const [row] = await db
    .update(equipment)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(equipment.id, input.equipmentId))
    .returning();
  if (!row) throw new Error("Alat tidak ditemukan.");

  const [item] = await db
    .select({
      name: equipmentItem.name,
      category: equipmentItem.category,
      image: equipmentItem.image,
    })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, row.itemId));

  return { ...row, itemName: item.name, category: item.category, image: item.image };
}

/**
 * Deteksi error dari partial unique index `equipment_active_usage_uniq`
 * (Postgres code 23505) dan terjemahkan jadi pesan yang enak dibaca. Ini
 * BUKAN pertahanan utamanya — index-nya sudah menegakkan itu — ini cuma
 * penerjemah.
 */
function isActiveUsageUniqueViolation(error: unknown): boolean {
  const direct = (error as { code?: unknown } | null)?.code;
  if (direct === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const causeCode = (cause as { code?: unknown } | null)?.code;
  return causeCode === "23505";
}

/** Staf. Mencatat sesi pinjam baru. */
export async function borrowEquipmentForUser(
  ctx: RbacContext,
  input: BorrowEquipmentInput,
): Promise<UsageRow> {
  assertCan(ctx, "equipment.borrow");
  await requireProjectReadOrReject(ctx, input.projectId);

  // Paksa: surveyor tidak pernah bisa mencatat alat di tangan orang lain.
  const usedById = ctx.user.role === "admin" ? (input.usedById ?? ctx.user.id) : ctx.user.id;

  // Kolom eksplisit: `borrowRejection` hanya butuh `condition`/`archivedAt`.
  // Dipanggil surveyor juga — `purchasePrice`/`purchaseDate` (admin-only) tidak
  // boleh sampai ke memori server di sini.
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
        recordedById: ctx.user.id,
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
  ctx: RbacContext,
  input: ReturnEquipmentInput,
): Promise<UsageRow> {
  assertCan(ctx, "equipment.return");

  const [session] = await db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.id, input.usageId));
  if (!session) throw new Error("Sesi pakai tidak ditemukan.");
  if (session.endedAt) throw new Error("Sesi pakai ini sudah ditutup.");

  if (ctx.user.role === "surveyor" && session.usedById !== ctx.user.id) {
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
  ctx: RbacContext,
  input: CorrectUsageInput,
): Promise<UsageRow> {
  assertCan(ctx, "equipment.correctUsage");

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
