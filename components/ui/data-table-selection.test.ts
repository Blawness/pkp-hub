import { describe, expect, it } from "vitest";
import { sameIds } from "@/components/ui/data-table-selection";

/**
 * Regresi "Maximum update depth exceeded" di halaman proyek 2026-07-29.
 *
 * Penyebab: dua efek sync di `DataTable` (external→internal, internal→
 * external) memicu satu sama lain tanpa henti. `Object.keys(rowSelection)`
 * selalu menghasilkan array baru; setiap emit ke parent melalui
 * `setSelectedIds` membuat prop reference baru; effect external→internal
 * melihat deps-nya berubah dan apply lagi; dst. Sampai React memotong dengan
 * error dan halaman freeze.
 *
 * Test ini mengunci primitif yang memutus siklus: `sameIds` membandingkan
 * KONTEN dua array, bukan referencenya. Tanpa ini, tidak ada cara di dalam
 * `useEffect` untuk membedakan "benar-benar berubah" dari "reference baru,
 * isi sama".
 */

describe("sameIds", () => {
  it("dua array kosong dianggap sama", () => {
    expect(sameIds([], [])).toBe(true);
  });

  it("array identik dengan urutan sama dianggap sama", () => {
    expect(sameIds(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
  });

  it("array identik dengan urutan BERBEDA tetap dianggap sama (Object.keys vs parent)", () => {
    // Inilah skenario produksi: parent mengirim ["b","a"], internal emit
    // ["a","b"] (urutan Object.keys insertion). Tanpa sort, kita akan
    // menganggapnya berbeda dan loop-nya terus berputar.
    expect(sameIds(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIds(["row-3", "row-1", "row-2"], ["row-1", "row-2", "row-3"])).toBe(true);
  });

  it("panjang berbeda -> beda", () => {
    expect(sameIds(["a"], ["a", "b"])).toBe(false);
    expect(sameIds(["a", "b"], ["a"])).toBe(false);
  });

  it("isi berbeda walau panjang sama -> beda", () => {
    expect(sameIds(["a", "b"], ["a", "c"])).toBe(false);
    expect(sameIds(["a", "b"], ["c", "d"])).toBe(false);
  });

  it("reference berbeda dengan isi sama tetap dianggap sama (kunci regresi)", () => {
    const a = ["row-1", "row-2"];
    const b = ["row-1", "row-2"];
    expect(a).not.toBe(b); // referensi beda
    expect(sameIds(a, b)).toBe(true); // tapi sameIds bilang sama
  });

  it("tidak memutasikan argumen (sort copy, bukan sort in-place)", () => {
    const a = ["b", "a"];
    const b = ["a", "b"];
    sameIds(a, b);
    expect(a).toEqual(["b", "a"]); // urutan asli a tidak berubah
    expect(b).toEqual(["a", "b"]);
  });

  it("case kosong + duplikat ditangani: panjang beda -> beda, walau ada irisan", () => {
    // Duplikat dipertahankan apa adanya — fungsi ini untuk id unik (key
    // tabel), jadi duplikat bukan kasus yang valid. Yang diuji di sini:
    // panjang jadi 3 vs 2 -> beda.
    expect(sameIds(["a", "a", "b"], ["a", "b"])).toBe(false);
  });
});
