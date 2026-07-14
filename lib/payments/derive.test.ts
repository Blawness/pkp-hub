import { describe, expect, it } from "vitest";
import { formatTanggalIndo } from "@/lib/format";
import { buildReceiptNumber, derivePaymentStatus, receiptStorageKey } from "@/lib/payments/derive";

describe("derivePaymentStatus", () => {
  it("belum ada uang masuk -> belum", () => {
    expect(derivePaymentStatus(0, 10_000_000)).toBe("belum");
  });

  it("sebagian masuk -> sebagian", () => {
    expect(derivePaymentStatus(4_000_000, 10_000_000)).toBe("sebagian");
  });

  it("pas -> lunas", () => {
    expect(derivePaymentStatus(10_000_000, 10_000_000)).toBe("lunas");
  });

  it("lebih bayar tetap lunas — kelebihannya urusan UI, bukan status", () => {
    expect(derivePaymentStatus(12_000_000, 10_000_000)).toBe("lunas");
  });

  it("nilai proyek belum diisi tapi ada uang masuk -> sebagian, tidak pernah lunas", () => {
    // Guard di payments-logic seharusnya mencegah keadaan ini terjadi sama
    // sekali. Kalau toh bocor, jangan pernah menyebutnya lunas: melaporkan
    // "lunas" untuk proyek yang nilainya tidak diketahui adalah kebohongan
    // yang menghapus piutang dari dashboard.
    expect(derivePaymentStatus(5_000_000, null)).toBe("sebagian");
    expect(derivePaymentStatus(5_000_000, 0)).toBe("sebagian");
  });
});

describe("buildReceiptNumber", () => {
  it("tahun dari paidAt, urut 4 digit", () => {
    expect(buildReceiptNumber(7, "2026-07-14")).toBe("KW/PKP/2026/0007");
  });

  it("tahun diambil dari STRING, bukan Date — 1 Januari tidak boleh mundur setahun", () => {
    expect(buildReceiptNumber(1, "2027-01-01")).toBe("KW/PKP/2027/0001");
  });

  it("urutan di atas 9999 tidak terpotong", () => {
    expect(buildReceiptNumber(12345, "2026-07-14")).toBe("KW/PKP/2026/12345");
  });
});

describe("receiptStorageKey", () => {
  it("garis miring nomor kwitansi jadi strip — ia tidak boleh jadi folder", () => {
    expect(receiptStorageKey("abc-123", "KW/PKP/2026/0007")).toBe(
      "receipts/abc-123/KW-PKP-2026-0007.pdf",
    );
  });
});

describe("formatTanggalIndo", () => {
  it("2026-07-14 -> 14 Juli 2026", () => {
    expect(formatTanggalIndo("2026-07-14")).toBe("14 Juli 2026");
  });

  it("tidak ada tanggal yang bergeser sehari karena timezone", () => {
    expect(formatTanggalIndo("2026-01-01")).toBe("1 Januari 2026");
  });
});
