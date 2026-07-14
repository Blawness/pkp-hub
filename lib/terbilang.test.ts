import { describe, expect, it } from "vitest";
import { terbilang, terbilangRupiah } from "@/lib/terbilang";

/**
 * Terbilang bukan sekadar loop pembagian. Bahasa Indonesia punya bentuk
 * khusus yang SELALU jebol di implementasi naif: "sebelas" (bukan "satu
 * belas"), "seratus" (bukan "satu ratus"), "seribu" (bukan "satu ribu").
 * Tabel di bawah ada persis untuk mengunci ketiganya.
 */
describe("terbilang", () => {
  const cases: [number, string][] = [
    [0, "nol"],
    [1, "satu"],
    [11, "sebelas"],
    [15, "lima belas"],
    [20, "dua puluh"],
    [21, "dua puluh satu"],
    [100, "seratus"],
    [101, "seratus satu"],
    [200, "dua ratus"],
    [1_000, "seribu"],
    [1_500, "seribu lima ratus"],
    [2_000, "dua ribu"],
    [1_000_000, "satu juta"],
    [7_500_000, "tujuh juta lima ratus ribu"],
    [15_000_000, "lima belas juta"],
    [1_000_000_000, "satu miliar"],
  ];

  for (const [input, expected] of cases) {
    it(`${input} -> "${expected}"`, () => {
      expect(terbilang(input)).toBe(expected);
    });
  }

  it("menolak angka negatif dan pecahan — kwitansi tidak punya arti untuknya", () => {
    expect(() => terbilang(-1)).toThrow();
    expect(() => terbilang(1.5)).toThrow();
  });
});

describe("terbilangRupiah", () => {
  it("huruf kapital tiap kata + akhiran Rupiah, seperti kwitansi cetak", () => {
    expect(terbilangRupiah(7_500_000)).toBe("Tujuh Juta Lima Ratus Ribu Rupiah");
  });

  it("nol rupiah tetap terbaca", () => {
    expect(terbilangRupiah(0)).toBe("Nol Rupiah");
  });
});
