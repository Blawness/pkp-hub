import { z } from "zod";

/**
 * Skema input ledger pembayaran. Sengaja dipisah dari `payments-logic.ts`
 * (yang server-only) mengikuti pola `finance-schemas.ts` — komponen klien
 * boleh mengimpor skema, tidak boleh mengimpor logika.
 */

export const paymentMethodSchema = z.enum(["transfer", "tunai", "lainnya"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const recordPaymentInputSchema = z.object({
  projectId: z.uuid(),
  // Rupiah bulat, harus positif. Pembayaran nol bukan pembayaran, dan
  // pembayaran negatif adalah refund — fitur lain, dengan aturan lain.
  // Max guard: bigint kolom kehilangan presisi di atas 2^53.
  amount: z
    .number()
    .int()
    .positive("Jumlah pembayaran harus lebih dari 0.")
    .max(Number.MAX_SAFE_INTEGER),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus dalam format YYYY-MM-DD."),
  method: paymentMethodSchema,
  note: z.string().trim().max(500).optional(),
});
export type RecordPaymentInput = z.infer<typeof recordPaymentInputSchema>;

export const voidPaymentInputSchema = z.object({
  paymentId: z.uuid(),
  // Alasan WAJIB. Baris ledger yang dibatalkan tanpa alasan adalah lubang di
  // catatan uang — enam bulan lagi tidak ada yang tahu kenapa ia hilang.
  reason: z.string().trim().min(3, "Tulis alasan pembatalan.").max(500),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentInputSchema>;

export const regenerateReceiptInputSchema = z.object({ paymentId: z.uuid() });
export type RegenerateReceiptInput = z.infer<typeof regenerateReceiptInputSchema>;
