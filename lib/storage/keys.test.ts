import { describe, expect, it } from "vitest";
import { parseStorageKey } from "@/lib/storage/keys";

describe("parseStorageKey", () => {
  it("mengenali kunci dokumen", () => {
    expect(parseStorageKey("documents/abc/laporan.pdf")).toEqual({
      kind: "document",
      projectId: "abc",
    });
  });

  it("mengenali kunci kwitansi", () => {
    expect(parseStorageKey("receipts/abc/KW-PKP-2026-0001.pdf")).toEqual({
      kind: "receipt",
      projectId: "abc",
    });
  });

  it("mengenali kunci gambar alat — tanpa projectId", () => {
    expect(parseStorageKey("equipment/9f8b2c1d.webp")).toEqual({ kind: "equipment" });
  });

  it("menolak prefix yang tidak dikenal — termasuk yang mencoba menyamar", () => {
    expect(parseStorageKey("secrets/abc/x.pdf")).toBeNull();
    expect(parseStorageKey("documents")).toBeNull();
    expect(parseStorageKey("receipts/")).toBeNull();
    expect(parseStorageKey("equipment")).toBeNull();
    expect(parseStorageKey("equipment/")).toBeNull();
    expect(parseStorageKey("")).toBeNull();
  });
});
