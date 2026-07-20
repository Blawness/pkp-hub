import { describe, expect, it } from "vitest";
import { truncateToWidth, paginateRows } from "@/lib/export/layout";

describe("truncateToWidth", () => {
  it("teks yang muat persis tidak dipotong", () => {
    // 5 huruf lebar 10 = 50, maxWidth 50 → pas.
    expect(truncateToWidth("abcde", 10, 50, "...")).toBe("abcde");
  });

  it("teks lebih dari lebar dipotong + elipsis", () => {
    // 10 huruf lebar 10 = 100, maxWidth 50. Sisa 50 cukup untuk "..." (30).
    // Hasil: 2 huruf + "..."
    expect(truncateToWidth("abcdefghij", 10, 50, "...")).toBe("ab...");
  });

  it("teks pendek tidak dipotong", () => {
    expect(truncateToWidth("hi", 10, 100, "...")).toBe("hi");
  });
});

describe("paginateRows", () => {
  it("baris sedikit → satu halaman", () => {
    expect(paginateRows(3, 10)).toEqual([3]);
  });

  it("baris melebihi satu halaman → dibagi rata, halaman terakhir sisa", () => {
    expect(paginateRows(25, 10)).toEqual([10, 10, 5]);
  });

  it("kelipatan pas → tanpa sisa kosong", () => {
    expect(paginateRows(20, 10)).toEqual([10, 10]);
  });

  it("nol baris → satu halaman kosong", () => {
    expect(paginateRows(0, 10)).toEqual([0]);
  });
});
