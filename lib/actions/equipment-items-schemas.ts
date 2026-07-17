import { z } from "zod";
import { equipmentCategorySchema } from "@/lib/actions/equipment-schemas";

/** Skema input jenis alat (spec 2026-07-16). Dipisah dari `equipment-schemas.ts` (unit fisik) — dua domain terpisah, dua file terpisah, pola yang sama dengan modul lain. */

export const createEquipmentItemInputSchema = z.object({
  name: z.string().trim().min(1, "Nama alat wajib diisi.").max(160),
  category: equipmentCategorySchema,
  // URL objek storage hasil upload (WebP). `null` = hapus gambar.
  image: z.string().trim().max(1000).nullable().optional(),
});
export type CreateEquipmentItemInput = z.infer<typeof createEquipmentItemInputSchema>;

export const updateEquipmentItemInputSchema = createEquipmentItemInputSchema.extend({
  itemId: z.uuid(),
});
export type UpdateEquipmentItemInput = z.infer<typeof updateEquipmentItemInputSchema>;

export const archiveEquipmentItemInputSchema = z.object({ itemId: z.uuid() });
export type ArchiveEquipmentItemInput = z.infer<typeof archiveEquipmentItemInputSchema>;
