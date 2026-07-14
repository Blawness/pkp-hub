import { describe, expect, it, vi } from "vitest";
import { generateAndStoreReceipt } from "@/lib/receipts";
import type { ReceiptData } from "@/lib/receipts/template";

const data: ReceiptData = {
  receiptNumber: "KW/PKP/2026/0007",
  paidAt: "2026-07-14",
  amount: 7_500_000,
  method: "transfer",
  note: null,
  clientName: "Budi Santoso",
  projectTitle: "Pengukuran Kavling Cibubur",
  surveyTypeLabel: "Kavling",
  projectValue: 15_000_000,
  totalPaid: 7_500_000,
  remaining: 7_500_000,
  voidedReason: null,
};

describe("generateAndStoreReceipt", () => {
  it("menulis PDF ke kunci kwitansi — BUKAN ke prefix documents/", async () => {
    const put = vi.fn(async () => "/api/storage/receipts/p1/KW-PKP-2026-0007.pdf");

    const fileUrl = await generateAndStoreReceipt("p1", data, { put });

    expect(put).toHaveBeenCalledTimes(1);
    const [key, body, contentType] = put.mock.calls[0] as unknown as [string, Buffer, string];
    // Prefix-nya load-bearing: rute storage lokal memakainya untuk MENOLAK
    // surveyor. Kwitansi yang tersimpan di bawah `documents/` akan lolos guard
    // dokumen dan membocorkan nilai proyek.
    expect(key).toBe("receipts/p1/KW-PKP-2026-0007.pdf");
    expect(contentType).toBe("application/pdf");
    expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(fileUrl).toBe("/api/storage/receipts/p1/KW-PKP-2026-0007.pdf");
  });

  it("melempar kalau storage gagal — pemanggil yang memutuskan apa artinya", async () => {
    const put = vi.fn(async () => {
      throw new Error("R2 down");
    });
    await expect(generateAndStoreReceipt("p1", data, { put })).rejects.toThrow("R2 down");
  });
});
