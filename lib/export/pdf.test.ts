import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReportPdf } from "@/lib/export/pdf";
import type { Column, ReportMeta } from "@/lib/export/types";

/**
 * Content stream pdf-lib menulis teks sebagai literal heksadesimal
 * (`<4B6F6465> Tj`) DAN meng-flate seluruh stream — jadi mencari string di
 * byte mentah tidak akan pernah ketemu. Dua-duanya harus dibongkar dulu.
 */
function decodeHexLiterals(stream: string): string {
  return stream.replace(/<([0-9A-Fa-f]+)>\s*Tj/g, (_all, hex: string) =>
    Buffer.from(hex, "hex").toString("latin1"),
  );
}

/** Teks yang benar-benar digambar, satu string per halaman. */
async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams =
      contents instanceof PDFArray
        ? contents.asArray().map((ref) => pdf.context.lookup(ref))
        : [contents];
    return streams
      .filter((s): s is PDFRawStream => s instanceof PDFRawStream)
      .map((s) => decodeHexLiterals(Buffer.from(decodePDFRawStream(s).decode()).toString("latin1")))
      .join("\n");
  });
}

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
    const [text] = await pageTexts(bytes);
    expect(text).toContain("Tidak ada data");
  });

  it("baris banyak → jumlah halaman bertambah (paginasi jalan)", async () => {
    const one = await buildReportPdf({ title: meta.title, columns }, makeRows(5), meta);
    const many = await buildReportPdf({ title: meta.title, columns }, makeRows(120), meta);
    const p1 = await PDFDocument.load(one);
    const p2 = await PDFDocument.load(many);
    expect(p1.getPageCount()).toBe(1);
    expect(p1.getPageCount()).toBeLessThan(p2.getPageCount());
    expect(p2.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it("tiap halaman bernomor 'Hal n/N' dan header tabel diulang", async () => {
    const bytes = await buildReportPdf({ title: meta.title, columns }, makeRows(120), meta);
    const texts = await pageTexts(bytes);
    const pageCount = texts.length;
    expect(pageCount).toBeGreaterThanOrEqual(3);

    texts.forEach((text, i) => {
      // Nomor halaman benar di TIAP halaman, bukan cuma ada di dokumen.
      expect(text).toContain(`Hal ${i + 1}/${pageCount}`);
      // Header tabel diulang di tiap halaman.
      expect(text).toContain("Kode");
      expect(text).toContain("Harga");
    });
  });
});
