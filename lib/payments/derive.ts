import type { PaymentStatus } from "@/lib/actions/finance-schemas";

/**
 * Fungsi murni di balik ledger pembayaran. Tidak menyentuh DB, tidak menyentuh
 * storage — sehingga aturan uangnya bisa diuji tanpa fixture apa pun.
 */

/**
 * `projects.paymentStatus` adalah kolom TURUNAN. Ini satu-satunya tempat yang
 * memutuskan nilainya; siapa pun yang menulis status tanpa lewat sini sedang
 * membuat kolom itu berbohong.
 */
export function derivePaymentStatus(
  totalPaid: number,
  projectValue: number | null,
): PaymentStatus {
  if (totalPaid <= 0) return "belum";
  if (projectValue == null || projectValue <= 0) return "sebagian";
  return totalPaid >= projectValue ? "lunas" : "sebagian";
}

/**
 * `KW/PKP/<tahun>/<urut 4 digit>`. Tahun diambil dari STRING `paidAt`
 * (`YYYY-MM-DD`), bukan dari `Date` — lihat catatan timezone di plan/spec.
 * `seq` datang dari sequence Postgres, jadi ia tidak pernah kembar.
 */
export function buildReceiptNumber(seq: number, paidAt: string): string {
  const year = paidAt.slice(0, 4);
  return `KW/PKP/${year}/${String(seq).padStart(4, "0")}`;
}

/** Kunci objek storage untuk kwitansi. Nomor kwitansi ber-"/" — datarkan jadi "-". */
export function receiptStorageKey(projectId: string, receiptNumber: string): string {
  return `receipts/${projectId}/${receiptNumber.replaceAll("/", "-")}.pdf`;
}
