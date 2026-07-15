import { z } from "zod";

/**
 * Skema input timeline fase. Dipisah dari `phases-logic.ts` (server-only)
 * mengikuti pola `payments-schemas.ts` — komponen klien boleh mengimpor skema,
 * tidak boleh mengimpor logika.
 */

export const phaseStatusSchema = z.enum(["belum", "berjalan", "selesai"]);
export type PhaseStatusInput = z.infer<typeof phaseStatusSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus dalam format YYYY-MM-DD.");

export const createPhaseInputSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Nama fase wajib diisi.").max(120),
  description: z.string().trim().max(1000).optional(),
  // Bobot minimal 1: bobot 0 membuat fase itu tidak pernah menggerakkan progres,
  // yang berarti mengerjakannya tidak berarti apa-apa — kalau memang begitu,
  // fase itu tidak perlu ada.
  weight: z.number().int().min(1, "Bobot minimal 1.").max(100).default(1),
  assignedSurveyorId: z.string().min(1).nullable().optional(),
  targetDate: dateString.nullable().optional(),
});
export type CreatePhaseInput = z.infer<typeof createPhaseInputSchema>;

export const updatePhaseInputSchema = z.object({
  phaseId: z.uuid(),
  name: z.string().trim().min(1, "Nama fase wajib diisi.").max(120),
  description: z.string().trim().max(1000).optional(),
  weight: z.number().int().min(1, "Bobot minimal 1.").max(100),
  assignedSurveyorId: z.string().min(1).nullable().optional(),
  targetDate: dateString.nullable().optional(),
});
export type UpdatePhaseInput = z.infer<typeof updatePhaseInputSchema>;

export const setPhaseStatusInputSchema = z.object({
  phaseId: z.uuid(),
  status: phaseStatusSchema,
});
export type SetPhaseStatusInput = z.infer<typeof setPhaseStatusInputSchema>;

export const updatePhaseNoteInputSchema = z.object({
  phaseId: z.uuid(),
  description: z.string().trim().max(1000),
});
export type UpdatePhaseNoteInput = z.infer<typeof updatePhaseNoteInputSchema>;

export const deletePhaseInputSchema = z.object({ phaseId: z.uuid() });
export type DeletePhaseInput = z.infer<typeof deletePhaseInputSchema>;

export const reorderPhasesInputSchema = z.object({
  projectId: z.uuid(),
  // Urutan BARU, lengkap. Bukan "pindahkan satu" — lihat `resequence`.
  orderedPhaseIds: z.array(z.uuid()).min(1),
});
export type ReorderPhasesInput = z.infer<typeof reorderPhasesInputSchema>;
