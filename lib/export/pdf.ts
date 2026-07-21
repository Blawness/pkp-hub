import { type PDFPage, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { formatCellText } from "@/lib/export/format";
import { truncateToWidth } from "@/lib/export/layout";
import type { Column, ReportDefinition, ReportMeta } from "@/lib/export/types";
import { STUDIO } from "@/lib/studio-identity";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 36;
const CHAR_WIDTH = 5; // aproksimasi Helvetica 9pt
const FONT_SIZE = 9;
const HEADER_H = 18;
const ROW_H = 16;
/** Ruang di kaki halaman untuk footnote + nomor halaman. */
const FOOTER_RESERVE = 40;

const ink = rgb(0.04, 0.05, 0.08);
const muted = rgb(0.45, 0.47, 0.52);
const headerFill = rgb(0.93, 0.94, 0.96);

/**
 * Render laporan tabular ke PDF A4 landscape. MURNI: data masuk, byte keluar —
 * tak sentuh DB/storage. Header tabel diulang tiap halaman, tiap halaman
 * bernomor "Hal n/N". Teks lewat lebar kolom dipotong + elipsis. `null` → sel
 * kosong.
 *
 * `columns` diterima sudah di-resolve (route yang memanggil `def.columns(user)`)
 * supaya modul ini tidak perlu tahu soal sesi/role.
 */
export async function buildReportPdf<Row>(
  def: Pick<ReportDefinition<Row>, "title"> & { columns: Column<Row>[] },
  rows: Row[],
  meta: ReportMeta,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const columns = def.columns;
  const totalWidth = A4_LANDSCAPE[0] - MARGIN * 2;
  const usedWidth = columns.reduce((s, c) => s + c.width, 0);
  // Skalakan kolom supaya pas di halaman (width dideklarasikan relatif).
  const scale = usedWidth > 0 ? totalWidth / usedWidth : 1;
  const colWidths = columns.map((c) => c.width * scale);

  /**
   * Gambar baris header tabel dengan sisi ATAS di `top`, kembalikan y baru.
   * Sengaja menerima `top` alih-alih selalu menempel di pinggir atas halaman:
   * di halaman pertama header tabel duduk di bawah kop studio.
   */
  const drawTableHeader = (page: PDFPage, top: number): number => {
    const y = top - HEADER_H;
    page.drawRectangle({ x: MARGIN, y, width: totalWidth, height: HEADER_H, color: headerFill });
    let x = MARGIN;
    columns.forEach((c, i) => {
      const text = truncateToWidth(c.header, CHAR_WIDTH, colWidths[i]! - 6, "...");
      page.drawText(text, { x: x + 3, y: y + 5, size: FONT_SIZE, font: bold, color: ink });
      x += colWidths[i]!;
    });
    return y;
  };

  const drawRow = (page: PDFPage, top: number, row: Row) => {
    let x = MARGIN;
    columns.forEach((c, i) => {
      const text = formatCellText(c.get(row), c.format ?? "text");
      const truncated = truncateToWidth(text, CHAR_WIDTH, colWidths[i]! - 6, "...");
      page.drawText(truncated, {
        x: x + 3,
        y: top - 11,
        size: FONT_SIZE,
        font: regular,
        color: ink,
      });
      x += colWidths[i]!;
    });
  };

  let page = pdf.addPage(A4_LANDSCAPE);
  let y = page.getHeight() - MARGIN;

  // Kop studio (halaman pertama saja).
  page.drawText(STUDIO.name, { x: MARGIN, y: y - 10, size: 11, font: bold, color: ink });
  y -= 14;
  page.drawText(STUDIO.address, { x: MARGIN, y: y - 10, size: 8, font: regular, color: muted });
  y -= 12;
  page.drawText(`${STUDIO.phone} · ${STUDIO.email}`, {
    x: MARGIN,
    y: y - 10,
    size: 8,
    font: regular,
    color: muted,
  });

  y -= 20;
  page.drawText(def.title, { x: MARGIN, y: y - 10, size: 13, font: bold, color: ink });
  y -= 16;
  if (meta.filterLabel) {
    page.drawText(meta.filterLabel, { x: MARGIN, y: y - 10, size: 9, font: regular, color: muted });
    y -= 13;
  }
  page.drawText(`Tanggal cetak: ${meta.printedAt}`, {
    x: MARGIN,
    y: y - 10,
    size: 9,
    font: regular,
    color: muted,
  });

  y -= 14;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + totalWidth, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 6;

  y = drawTableHeader(page, y);

  if (rows.length === 0) {
    page.drawText("Tidak ada data", {
      x: MARGIN + 3,
      y: y - 11,
      size: FONT_SIZE,
      font: regular,
      color: muted,
    });
    y -= ROW_H;
  } else {
    for (const row of rows) {
      // Ganti halaman ketika baris berikutnya akan menabrak kaki halaman.
      if (y - ROW_H < MARGIN + FOOTER_RESERVE) {
        page = pdf.addPage(A4_LANDSCAPE);
        y = drawTableHeader(page, page.getHeight() - MARGIN);
      }
      drawRow(page, y, row);
      y -= ROW_H;
    }
  }

  // Footnote di kaki halaman terakhir.
  if (meta.footnote) {
    y -= 8;
    page.drawText(meta.footnote, {
      x: MARGIN,
      y: y - 11,
      size: FONT_SIZE,
      font: regular,
      color: muted,
    });
  }

  // Nomor halaman di semua halaman (baru bisa setelah total halaman diketahui).
  const pageCount = pdf.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const pg = pdf.getPage(i);
    pg.drawText(`Hal ${i + 1}/${pageCount}`, {
      x: MARGIN + totalWidth - 60,
      y: MARGIN / 2,
      size: 8,
      font: regular,
      color: muted,
    });
  }

  return pdf.save();
}
