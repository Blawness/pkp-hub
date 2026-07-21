import { z } from "zod";
import { equipmentCategorySchema } from "@/lib/actions/equipment-schemas";

/** Skema input jenis alat (spec 2026-07-16). Dipisah dari `equipment-schemas.ts` (unit fisik) — dua domain terpisah, dua file terpisah, pola yang sama dengan modul lain. */

/**
 * Kolom `image` menyimpan ALAMAT objek storage, bukan URL yang bisa dibuka.
 * Presigned URL (`downloadUrlFor()`) adalah kredensial berumur 1 jam — kalau ia
 * sampai tersimpan, `keyFromUrl()` melempar dan SELURUH halaman inventaris
 * tumbang (insiden produksi 2026-07-21: URL pratinjau ter-round-trip balik
 * lewat form edit).
 *
 * Bedanya kelihatan murni dari string: alamat objek — R2 (`.../bucket/key`)
 * maupun driver lokal (`/api/storage/key`) — tidak pernah punya query string,
 * sedangkan presigned URL selalu punya. Penjagaan ini sengaja hidup di schema,
 * bukan di `lib/storage`, supaya form klien ikut tervalidasi tanpa menyeret
 * driver R2 (aws-sdk) ke bundle browser.
 */
const storageObjectUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((url) => !url.includes("?"), {
    message:
      "URL gambar tidak sah: sepertinya URL bertanda tangan sementara, bukan alamat objek storage.",
  });

export const createEquipmentItemInputSchema = z.object({
  name: z.string().trim().min(1, "Nama alat wajib diisi.").max(160),
  category: equipmentCategorySchema,
  // URL objek storage hasil upload (WebP). `null` = hapus gambar.
  image: storageObjectUrl.nullable().optional(),
});
export type CreateEquipmentItemInput = z.infer<typeof createEquipmentItemInputSchema>;

export const updateEquipmentItemInputSchema = createEquipmentItemInputSchema.extend({
  itemId: z.uuid(),
});
export type UpdateEquipmentItemInput = z.infer<typeof updateEquipmentItemInputSchema>;

export const archiveEquipmentItemInputSchema = z.object({ itemId: z.uuid() });
export type ArchiveEquipmentItemInput = z.infer<typeof archiveEquipmentItemInputSchema>;
