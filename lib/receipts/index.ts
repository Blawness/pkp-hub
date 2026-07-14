import { receiptStorageKey } from "@/lib/payments/derive";
import { buildReceiptPdf, type ReceiptData } from "@/lib/receipts/template";
import { storage } from "@/lib/storage";
import type { StorageDriver } from "@/lib/storage/types";

/**
 * Satu-satunya tempat kwitansi menyentuh storage.
 *
 * `store` bisa disuntik supaya test bisa memakai driver palsu — termasuk yang
 * SENGAJA melempar, karena "pembayaran tetap tercatat walau kwitansi gagal
 * dibuat" adalah invarian yang harus diuji, bukan diharapkan.
 */
export type ReceiptStorage = Pick<StorageDriver, "put">;

/**
 * Render kwitansi dan simpan di bawah prefix `receipts/`. Mengembalikan
 * `fileUrl` yang disimpan ke `payment.receiptFileUrl`.
 *
 * Melempar kalau render/upload gagal. Ia TIDAK menelan errornya sendiri:
 * yang tahu apa arti kegagalan ini adalah pemanggilnya (`payments-logic.ts`),
 * dan di sana keputusannya jelas — uang yang sudah masuk tetap tercatat.
 */
export async function generateAndStoreReceipt(
  projectId: string,
  data: ReceiptData,
  store: ReceiptStorage = storage,
): Promise<string> {
  const key = receiptStorageKey(projectId, data.receiptNumber);
  const bytes = await buildReceiptPdf(data);
  return store.put(key, Buffer.from(bytes), "application/pdf");
}
