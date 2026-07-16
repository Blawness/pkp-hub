import { desc, eq } from "drizzle-orm";
import type {
  CreateEquipmentItemInput,
  UpdateEquipmentItemInput,
} from "@/lib/actions/equipment-items-schemas";
import { type EquipmentListItem, listEquipmentForUser } from "@/lib/actions/equipment-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { equipmentItem } from "@/lib/db/schema";
import { summarizeUnits } from "@/lib/equipment/derive";
import { storage } from "@/lib/storage";

/**
 * Jenis alat (`equipmentItem`) — spec 2026-07-16. Unit fisiknya (`equipment`)
 * dan logikanya ada di `equipment-logic.ts`; file ini hanya mengurus jenis +
 * pengelompokan unit per jenis untuk daftar inventaris.
 */

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

export type EquipmentItemRow = {
  id: string;
  name: string;
  category: string;
  image: string | null;
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
 */
export async function listEquipmentItemsForUser(
  user: SessionUser,
): Promise<EquipmentItemWithUnits[]> {
  requireStaff(user);

  const items = await db.select().from(equipmentItem).orderBy(desc(equipmentItem.createdAt));
  const units = await listEquipmentForUser(user);

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
  user: SessionUser,
  input: CreateEquipmentItemInput,
): Promise<EquipmentItemRow> {
  requireAdmin(user);

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
  user: SessionUser,
  input: UpdateEquipmentItemInput,
): Promise<EquipmentItemRow> {
  requireAdmin(user);

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
