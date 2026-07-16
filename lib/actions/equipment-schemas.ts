import { z } from "zod";

/** Skema input inventaris alat. Dipisah dari logika (server-only) — komponen klien boleh mengimpor ini. */

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
  name: z.string().trim().min(1, "Nama alat wajib diisi.").max(160),
  category: equipmentCategorySchema,
  serialNumber: z.string().trim().max(120).optional(),
  condition: equipmentConditionSchema.default("tersedia"),
  purchaseDate: dateString.nullable().optional(),
  purchasePrice: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
  // URL objek storage hasil upload (WebP). `null` = hapus gambar.
  image: z.string().trim().max(1000).nullable().optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentInputSchema>;

export const updateEquipmentInputSchema = createEquipmentInputSchema.extend({
  equipmentId: z.uuid(),
});
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
