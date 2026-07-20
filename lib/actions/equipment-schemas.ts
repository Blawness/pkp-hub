import { z } from "zod";

/** Skema input inventaris alat — UNIT FISIK (spec 2026-07-14, direvisi spec 2026-07-16). Jenis alat ada di `equipment-items-schemas.ts`. Dipisah dari logika (server-only) — komponen klien boleh mengimpor ini. */

export const equipmentCategorySchema = z.enum([
  "instrumen_ukur",
  "gps_rtk",
  "drone",
  "aksesoris_survey",
  "laptop",
  "inventaris_kantor",
  "lainnya",
]);
export type EquipmentCategoryInput = z.infer<typeof equipmentCategorySchema>;

export const equipmentConditionSchema = z.enum(["tersedia", "perawatan", "rusak", "pensiun"]);
export type EquipmentConditionInput = z.infer<typeof equipmentConditionSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus dalam format YYYY-MM-DD.");

export const createEquipmentInputSchema = z.object({
  itemId: z.uuid(),
  // Kode inventaris studio, unik per unit — lihat komentar di lib/db/schema.ts.
  code: z.string().trim().min(1, "Kode unit wajib diisi.").max(60),
  serialNumber: z.string().trim().max(120).optional(),
  condition: equipmentConditionSchema.default("tersedia"),
  purchaseDate: dateString.nullable().optional(),
  purchasePrice: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentInputSchema>;

// `itemId` sengaja TIDAK ada di sini — unit tidak pindah item setelah dibuat
// (lihat spec §Ruang lingkup, non-goal).
export const updateEquipmentInputSchema = createEquipmentInputSchema
  .omit({ itemId: true })
  .extend({ equipmentId: z.uuid() });
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentInputSchema>;

export const archiveEquipmentInputSchema = z.object({ equipmentId: z.uuid() });
export type ArchiveEquipmentInput = z.infer<typeof archiveEquipmentInputSchema>;

export const borrowEquipmentInputSchema = z.object({
  equipmentId: z.uuid(),
  projectId: z.uuid(),
  // Boleh dimundurkan (lupa menekan tombol), tidak boleh maju — ditegakkan di logic layer.
  startedAt: z.coerce.date(),
  // Admin boleh mengisi ini. Untuk surveyor, server MEMAKSA-nya jadi id dirinya
  // sendiri — bukan sekadar tidak merendernya di form.
  usedById: z.string().min(1).optional(),
  note: z.string().trim().max(500).optional(),
});
export type BorrowEquipmentInput = z.infer<typeof borrowEquipmentInputSchema>;

export const returnEquipmentInputSchema = z.object({
  usageId: z.uuid(),
  endedAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});
export type ReturnEquipmentInput = z.infer<typeof returnEquipmentInputSchema>;

export const correctUsageInputSchema = z.object({
  usageId: z.uuid(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  note: z.string().trim().max(500).optional(),
});
export type CorrectUsageInput = z.infer<typeof correctUsageInputSchema>;
