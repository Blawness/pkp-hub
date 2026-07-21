import { describe, expect, it } from "vitest";
import { formatCellText, formatCellValue } from "@/lib/export/format";

describe("formatCellText", () => {
  it("currency → Rp dengan locale id-ID, tanpa desimal; null → string kosong", () => {
    expect(formatCellText(1_250_000, "currency")).toBe("Rp1.250.000");
    expect(formatCellText(null, "currency")).toBe("");
  });

  it("number → ribuan dipisah titik; null → string kosong", () => {
    expect(formatCellText(1234567, "number")).toBe("1.234.567");
    expect(formatCellText(null, "number")).toBe("");
  });

  it("date → '14 Juli 2026'; null → string kosong", () => {
    expect(formatCellText(new Date(2026, 6, 14), "date")).toBe("14 Juli 2026");
    expect(formatCellText(null, "date")).toBe("");
  });

  it("text → toString; null → string kosong, bukan 'null'", () => {
    expect(formatCellText("halo", "text")).toBe("halo");
    expect(formatCellText(42, "text")).toBe("42");
    expect(formatCellText(null, "text")).toBe("");
  });
});

describe("formatCellValue", () => {
  it("currency & number → number asli (bukan string berformat)", () => {
    expect(formatCellValue(1_250_000, "currency")).toBe(1_250_000);
    expect(formatCellValue(1234567, "number")).toBe(1234567);
    expect(formatCellValue(null, "currency")).toBeNull();
  });

  it("date → Date asli", () => {
    const d = new Date(2026, 6, 14);
    expect(formatCellValue(d, "date")).toBe(d);
    expect(formatCellValue(null, "date")).toBeNull();
  });

  it("text → string", () => {
    expect(formatCellValue("halo", "text")).toBe("halo");
    expect(formatCellValue(null, "text")).toBeNull();
  });
});
