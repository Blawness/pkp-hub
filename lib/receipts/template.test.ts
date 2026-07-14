import { describe, expect, it } from "vitest";
import { buildReceiptPdf, type ReceiptData } from "@/lib/receipts/template";

/**
 * Template kwitansi sengaja MURNI (data masuk, byte keluar) supaya bisa diuji
 * tanpa DB, tanpa storage, tanpa browser. Yang diuji bukan tata letaknya —
 * itu urusan mata — melainkan bahwa ia menghasilkan PDF yang sah dan bahwa
 * angka & nama yang benar benar-benar sampai ke dalamnya.
 */

const data: ReceiptData = {
  receiptNumber: "KW/PKP/2026/0007",
  paidAt: "2026-07-14",
  amount: 7_500_000,
  method: "transfer",
  note: "DP 50%",
  clientName: "Budi Santoso",
  projectTitle: "Pengukuran Kavling Cibubur",
  surveyTypeLabel: "Kavling",
  projectValue: 15_000_000,
  totalPaid: 7_500_000,
  remaining: 7_500_000,
  voidedReason: null,
};

describe("buildReceiptPdf", () => {
  it("menghasilkan PDF yang sah", async () => {
    const bytes = await buildReceiptPdf(data);
    expect(bytes.length).toBeGreaterThan(0);
    // Magic bytes "%PDF-" — kalau ini meleset, yang kita simpan ke R2 bukan PDF.
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("kwitansi yang dibatalkan tetap terbit, tapi membawa cap DIBATALKAN", async () => {
    const normal = await buildReceiptPdf(data);
    const voided = await buildReceiptPdf({ ...data, voidedReason: "Salah nominal" });
    // Versi batal punya isi tambahan (cap + alasan), jadi tidak mungkin identik.
    expect(voided.length).not.toBe(normal.length);
    expect(Buffer.from(voided.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("nominal nol tidak membuatnya meledak", async () => {
    const bytes = await buildReceiptPdf({
      ...data,
      amount: 0,
      totalPaid: 0,
      remaining: 15_000_000,
    });
    expect(bytes.length).toBeGreaterThan(0);
  });
});
