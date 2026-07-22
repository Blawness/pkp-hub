import { and, count, desc, eq, isNull } from "drizzle-orm";
import type {
  ArchiveEquipmentItemInput,
  CreateEquipmentItemInput,
  UpdateEquipmentItemInput,
} from "@/lib/actions/equipment-items-schemas";
import { type EquipmentListItem, listEquipmentForUser } from "@/lib/actions/equipment-logic";
import { db } from "@/lib/db";
import { equipment, equipmentItem } from "@/lib/db/schema";
import { summarizeUnits } from "@/lib/equipment/derive";
import { assertCan } from "@/lib/rbac/can";
import type { RbacContext } from "@/lib/rbac/types";
import { storage } from "@/lib/storage";

/**
 * Jenis alat (`equipmentItem`) — spec 2026-07-16. Unit fisiknya (`equipment`)
 * dan logikanya ada di `equipment-logic.ts`; file ini hanya mengurus jenis +
 * pengelompokan unit per jenis untuk daftar inventaris. Izin lewat engine RBAC:
 * `equipmentItem.create/update/archive` admin-only; daftar dibaca dengan
 * `equipment.read` (sama seperti daftar unit yang diagregasikannya).
 */

export type EquipmentItemRow = {
  id: string;
  name: string;
  category: string;
  image: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EquipmentItemWithUnits = {
  item: EquipmentItemRow;
  units: EquipmentListItem[];
  summary: ReturnType<typeof summarizeUnits>;
};

/**
 * Semua jenis alat + unit-unitnya (dikelompokkan dari `listEquipmentForUser`)
 * + agregat per jenis. Item tanpa unit tetap tampil, dengan summary nol —
 * supaya admin masih bisa "+ Tambah unit" untuk jenis yang baru dibuat.
 * Jenis terarsip tidak ikut, sama seperti unit terarsip di `listEquipmentForUser`.
 */
export async function listEquipmentItemsForUser(
  ctx: RbacContext,
): Promise<EquipmentItemWithUnits[]> {
  assertCan(ctx, "equipment.read");

  const items = await db
    .select()
    .from(equipmentItem)
    .where(isNull(equipmentItem.archivedAt))
    .orderBy(desc(equipmentItem.createdAt));
  const units = await listEquipmentForUser(ctx);

  const unitsByItemId = new Map<string, EquipmentListItem[]>();
  for (const unit of units) {
    const list = unitsByItemId.get(unit.itemId) ?? [];
    list.push(unit);
    unitsByItemId.set(unit.itemId, list);
  }

  return items.map((item) => {
    const itemUnits = unitsByItemId.get(item.id) ?? [];
    return { item, units: itemUnits, summary: summarizeUnits(itemUnits) };
  });
}

export async function createEquipmentItemForUser(
  ctx: RbacContext,
  input: CreateEquipmentItemInput,
): Promise<EquipmentItemRow> {
  assertCan(ctx, "equipmentItem.create");

  const [row] = await db
    .insert(equipmentItem)
    .values({
      name: input.name,
      category: input.category,
      image: input.image && input.image.length > 0 ? input.image : null,
    })
    .returning();
  return row;
}

/** Sama alasan dengan `equipment-logic.ts` sebelumnya: hapus objek gambar lama best-effort, jangan gagalkan operasi utama. */
async function deleteImageObject(fileUrl: string): Promise<void> {
  try {
    await storage.delete(storage.keyFromUrl(fileUrl));
  } catch {
    // abaikan
  }
}

export async function updateEquipmentItemForUser(
  ctx: RbacContext,
  input: UpdateEquipmentItemInput,
): Promise<EquipmentItemRow> {
  assertCan(ctx, "equipmentItem.update");

  const [existing] = await db
    .select({ image: equipmentItem.image })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, input.itemId));
  if (!existing) throw new Error("Jenis alat tidak ditemukan.");

  const nextImage = input.image && input.image.length > 0 ? input.image : null;

  const [row] = await db
    .update(equipmentItem)
    .set({
      name: input.name,
      category: input.category,
      image: nextImage,
      updatedAt: new Date(),
    })
    .where(eq(equipmentItem.id, input.itemId))
    .returning();
  if (!row) throw new Error("Jenis alat tidak ditemukan.");

  if (existing.image && existing.image !== nextImage) {
    await deleteImageObject(existing.image);
  }
  return row;
}

/**
 * Arsipkan JENIS alat — soft delete, sama alasan dengan unit: `equipment.itemId`
 * pakai `onDelete: "restrict"` dan riwayat pakai harus tetap bisa menyebut nama
 * jenisnya.
 *
 * Ditolak selama masih ada unit yang belum diarsipkan, supaya tidak ada unit
 * yatim: unit yang jenisnya hilang dari daftar tapi dirinya sendiri masih
 * aktif dan bisa dipinjam. Hitungannya query `equipment` LANGSUNG, bukan lewat
 * `listEquipmentForUser` — list itu sudah menyaring unit terarsip, jadi dipakai
 * sebagai penjaga di sini justru akan melaporkan nol untuk jenis yang unitnya
 * masih ada.
 */
export async function archiveEquipmentItemForUser(
  ctx: RbacContext,
  input: ArchiveEquipmentItemInput,
): Promise<EquipmentItemRow> {
  assertCan(ctx, "equipmentItem.archive");

  const [existing] = await db
    .select({ id: equipmentItem.id })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, input.itemId));
  if (!existing) throw new Error("Jenis alat tidak ditemukan.");

  const [{ activeUnits }] = await db
    .select({ activeUnits: count() })
    .from(equipment)
    .where(and(eq(equipment.itemId, input.itemId), isNull(equipment.archivedAt)));

  if (activeUnits > 0) {
    throw new Error(
      `Masih ada ${activeUnits} unit — arsipkan unitnya dulu sebelum menghapus jenis ini.`,
    );
  }

  const [row] = await db
    .update(equipmentItem)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(equipmentItem.id, input.itemId))
    .returning();
  if (!row) throw new Error("Jenis alat tidak ditemukan.");
  return row;
}
