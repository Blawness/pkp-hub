import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { Column, ReportMeta } from "@/lib/export/types";
import { buildReportXlsx } from "@/lib/export/xlsx";

type Row = { name: string; price: number | null; boughtAt: Date | null };

const columns: Column<Row>[] = [
  { header: "Nama", get: (r) => r.name, width: 100, format: "text" },
  { header: "Harga", get: (r) => r.price, width: 80, align: "right", format: "currency" },
  { header: "Beli", get: (r) => r.boughtAt, width: 80, format: "date" },
];

/** Sheet pertama workbook — exceljs mengetikkannya optional, di sini pasti ada. */
function firstSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("workbook tanpa sheet");
  return ws;
}

const meta: ReportMeta = {
  title: "Laporan Tes",
  printedAt: "20 Juli 2026",
  filterLabel: null,
  footnote: "Total: 2 unit",
};

describe("buildReportXlsx", () => {
  it("header di baris 1, data benar, harga tersimpan sebagai ANGKA bukan string", async () => {
    const rows: Row[] = [
      { name: "GPS", price: 1_250_000, boughtAt: new Date(2026, 0, 5) },
      { name: "Total Station", price: null, boughtAt: null },
    ];
    const bytes = await buildReportXlsx({ title: meta.title, columns }, rows, meta);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = firstSheet(wb);

    // Header baris 1
    expect(ws.getCell(1, 1).value).toBe("Nama");
    expect(ws.getCell(1, 2).value).toBe("Harga");
    expect(ws.getCell(1, 3).value).toBe("Beli");

    // Data baris 2
    expect(ws.getCell(2, 1).value).toBe("GPS");
    // Harga tersimpan sebagai number (bukan string berformat)
    expect(ws.getCell(2, 2).value).toBe(1_250_000);
    expect(typeof ws.getCell(2, 2).value).toBe("number");
    // Tanggal sebagai Date
    expect(ws.getCell(2, 3).value instanceof Date).toBe(true);

    // Baris 3: harga null → sel kosong (null), bukan string "null"/"-"
    expect(ws.getCell(3, 2).value).toBeNull();
    expect(ws.getCell(3, 3).value).toBeNull();
  });

  it("footnote di baris terakhir setelah satu baris kosong", async () => {
    const bytes = await buildReportXlsx({ title: meta.title, columns }, [], meta);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const ws = firstSheet(wb);

    // Baris 1 header, baris 2 kosong (spacer), baris 3 footnote.
    expect(ws.getCell(2, 1).value).toBeNull();
    expect(ws.getCell(3, 1).value).toBe("Total: 2 unit");
  });

  it("byte diawali dengan PK tanda zip xlsx", async () => {
    const bytes = await buildReportXlsx({ title: meta.title, columns }, [], meta);
    // XLSX = zip → magic bytes "PK"
    expect(Buffer.from(bytes.slice(0, 2)).toString("ascii")).toBe("PK");
  });
});
