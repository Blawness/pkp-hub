import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReportPdf } from "@/lib/export/pdf";
import type { Column, ReportMeta } from "@/lib/export/types";

type Row = { code: string; name: string; price: number | null };

const columns: Column<Row>[] = [
  { header: "Kode", get: (r) => r.code, width: 90 },
  { header: "Nama", get: (r) => r.name, width: 200 },
  { header: "Harga", get: (r) => r.price, width: 90, align: "right", format: "currency" },
];

const meta: ReportMeta = {
  title: "Laporan Tes",
  printedAt: "20 Juli 2026",
  filterLabel: "Kategori: GPS RTK",
  footnote: "Total: 3 unit",
};

function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    code: `U-${i}`,
    name: `Alat ${i}`,
    price: i % 2 === 0 ? 1_000_000 : null,
  }));
}

describe("buildReportPdf", () => {
  it("byte diawali %PDF-", async () => {
    const bytes = await buildReportPdf({ title: meta.title, columns }, makeRows(2), meta);
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
  });

  it("rows kosong tidak melempar, tetap PDF sah berisi 'Tidak ada data'", async () => {
    const bytes = await buildReportPdf({ title: meta.title, columns }, [], meta);
    expect(Buffer.from(bytes.slice(0, 5)).toString("ascii")).toBe("%PDF-");
    const text = Buffer.from(bytes).toString("latin1");
    expect(text).toContain("Tidak ada data");
  });

  it("baris banyak → jumlah halaman bertambah (paginasi jalan)", async () => {
    const one = await buildReportPdf({ title: meta.title, columns }, makeRows(5), meta);
    const many = await buildReportPdf({ title: meta.title, columns }, makeRows(120), meta);
    const p1 = await PDFDocument.load(one);
    const p2 = await PDFDocument.load(many);
    expect(p1.getPageCount()).toBeLessThan(p2.getPageCount());
    // 120 baris / ~38 per halaman → minimal 3 halaman.
    expect(p2.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it("penomoran halaman 'Hal n/N' ada di dokumen", async () => {
    const bytes = await buildReportPdf({ title: meta.title, columns }, makeRows(120), meta);
    const full = Buffer.from(bytes).toString("latin1");
    expect(full).toContain("Hal 1/");
    expect(full).toContain("Hal 2/");
  });
});
