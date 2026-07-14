import { z } from "zod";

/**
 * Shared zod schemas for Keuangan Ringan (PRD §3 Feature 5), mirroring the
 * split used by `documents-schemas.ts` / `projects-schemas.ts`: plain schema
 * definitions consumed by both the unit-testable `finance-logic.ts` and the
 * "use server" wrapper in `finance.ts`.
 */
export const paymentStatusSchema = z.enum(["belum", "sebagian", "lunas"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * `paymentStatus` SENGAJA tidak ada di sini. Sejak ledger pembayaran masuk
 * (spec 2026-07-14) status adalah kolom TURUNAN — dihitung dari uang yang
 * benar-benar masuk oleh `recomputePaymentStatus`. Menerimanya kembali sebagai
 * input berarti mengizinkan seseorang menandai proyek "lunas" tanpa satu rupiah
 * pun tercatat, dan itulah persis penyakit yang fitur ini obati.
 */
export const updatePaymentInputSchema = z.object({
  projectId: z.uuid(),
  projectValue: z.number().int().nonnegative().nullable(),
  paymentNotes: z.string().trim().max(2000).optional(),
});
export type UpdatePaymentInput = z.infer<typeof updatePaymentInputSchema>;
