import { describe, expect, it } from "vitest";
import {
  createEquipmentItemInputSchema,
  updateEquipmentItemInputSchema,
} from "@/lib/actions/equipment-items-schemas";

/**
 * Regresi insiden 2026-07-21: halaman inventaris produksi tumbang karena
 * `equipment_item.image` berisi URL presigned (`?X-Amz-Signature=...`), bukan
 * URL objek kanonik. Penyebabnya URL pratinjau hasil `downloadUrlFor()`
 * ter-round-trip balik lewat form edit.
 *
 * Kolom itu menyimpan ALAMAT OBJEK, dan alamat objek tidak pernah punya query
 * string — presigned URL adalah kredensial berbatas waktu, bukan alamat.
 * Perbedaannya kelihatan murni dari string-nya, jadi penjagaan ini bisa hidup
 * di schema (dipakai server DAN klien) tanpa menyeret driver storage ke bundle.
 */

const PRESIGNED =
  "https://pkp-cms.d3c7b0f5b7fc96eee07fc483c6d0645e.r2.cloudflarestorage.com/equipment/10d89596-1d52-436b-9429-cf2dd8734c2e.webp?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=9c5abd26bde5f13575072d9f4d2c1608260fa0e9bc0856d199ef2f7be57a4c95&x-id=GetObject";

const CANONICAL =
  "https://d3c7b0f5b7fc96eee07fc483c6d0645e.r2.cloudflarestorage.com/pkp-cms/equipment/10d89596-1d52-436b-9429-cf2dd8734c2e.webp";

describe("equipment item image guard", () => {
  it("MENOLAK URL presigned — persis nilai yang menjatuhkan produksi", () => {
    const result = createEquipmentItemInputSchema.safeParse({
      name: "Total Station Sokkia",
      category: "instrumen_ukur",
      image: PRESIGNED,
    });
    expect(result.success).toBe(false);
  });

  it("menolak query string apa pun, walau tanpa tanda tangan", () => {
    const result = createEquipmentItemInputSchema.safeParse({
      name: "Total Station Sokkia",
      category: "instrumen_ukur",
      image: `${CANONICAL}?v=2`,
    });
    expect(result.success).toBe(false);
  });

  it("menerima URL objek R2 kanonik", () => {
    const result = createEquipmentItemInputSchema.safeParse({
      name: "Total Station Sokkia",
      category: "instrumen_ukur",
      image: CANONICAL,
    });
    expect(result.success).toBe(true);
  });

  it("menerima URL driver lokal (dev) — bentuknya juga tanpa query", () => {
    const result = createEquipmentItemInputSchema.safeParse({
      name: "Total Station Sokkia",
      category: "instrumen_ukur",
      image: "/api/storage/equipment/abc.webp",
    });
    expect(result.success).toBe(true);
  });

  it("menerima null & undefined — gambar boleh dihapus / tidak diisi", () => {
    for (const image of [null, undefined]) {
      const result = createEquipmentItemInputSchema.safeParse({
        name: "Total Station Sokkia",
        category: "instrumen_ukur",
        image,
      });
      expect(result.success).toBe(true);
    }
  });

  it("penjagaan yang sama ikut ke schema update — jalur yang sebenarnya rusak", () => {
    const result = updateEquipmentItemInputSchema.safeParse({
      itemId: "3f6f9a1e-6b0e-4f2e-9a3c-1d2b8c7e5a40",
      name: "Total Station Sokkia",
      category: "instrumen_ukur",
      image: PRESIGNED,
    });
    expect(result.success).toBe(false);
  });
});
