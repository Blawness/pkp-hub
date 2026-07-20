import {
  PDFContentStream,
  type PDFContext,
  PDFDocument,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
  type PDFRef,
  PDFString,
  rgb,
  StandardFonts,
} from "pdf-lib";
import { formatCellText } from "@/lib/export/format";
import { truncateToWidth } from "@/lib/export/layout";
import type { Column, ReportMeta } from "@/lib/export/types";
import { STUDIO } from "@/lib/studio-identity";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 36;
const CHAR_WIDTH = 5;
const FONT_SIZE = 9;
const HEADER_H = 18;
const ROW_H = 16;
const MAX_ROWS_PER_PAGE = 38;

const ink = rgb(0.04, 0.05, 0.08);
const muted = rgb(0.45, 0.47, 0.52);
const headerFill = rgb(0.93, 0.94, 0.96);

export async function buildReportPdf<Row>(
  def: { title: string; columns: Column<Row>[] },
  rows: Row[],
  meta: ReportMeta,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica, { subset: false });
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold, { subset: false });

  // pdf-lib menyimpan teks sebagai PDFHexString; agari teks terbaca mentah di
  // byte PDF (untuk inspeksi/assert), paksa font menulis PDFString literal
  // ASCII. Font standar Helvetica sudah pakai WinAnsi, jadi ASCII aman.
  type EncodableFont = PDFFont & { encodeText: (text: string) => unknown };
  for (const font of [regular, bold] as EncodableFont[]) {
    const original = font.encodeText.bind(font) as (text: string) => unknown;
    font.encodeText = ((text: string) =>
      /^[\x20-\x7e]*$/.test(text)
        ? (PDFString.of(text) as unknown)
        : original(text)) as EncodableFont["encodeText"];
  }

  const columns = def.columns;
  const contentWidth = A4_LANDSCAPE[0] - MARGIN * 2;
  const usedWidth = columns.reduce((s, c) => s + c.width, 0);
  const scale = usedWidth > 0 ? contentWidth / usedWidth : 1;
  const colWidths = columns.map((c) => c.width * scale);

  const drawHeader = (page: PDFPage) => {
    const top = page.getHeight() - MARGIN - HEADER_H;
    page.drawRectangle({
      x: MARGIN,
      y: top,
      width: contentWidth,
      height: HEADER_H,
      color: headerFill,
    });
    let x = MARGIN;
    columns.forEach((c, i) => {
      page.drawText(c.header, {
        x: x + 3,
        y: top + 5,
        size: FONT_SIZE,
        font: bold,
        color: ink,
      });
      x += colWidths[i];
    });
  };

  let page: PDFPage = pdf.addPage(A4_LANDSCAPE);
  let y = page.getHeight() - MARGIN;

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
  page.drawText(meta.title, { x: MARGIN, y: y - 10, size: 13, font: bold, color: ink });
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
    end: { x: MARGIN + contentWidth, y },
    thickness: 0.5,
    color: muted,
  });

  drawHeader(page);
  let rowY = page.getHeight() - MARGIN - HEADER_H - ROW_H;
  let rowsOnPage = 0;

  const drawRow = (row: Row) => {
    let x = MARGIN;
    columns.forEach((c, i) => {
      const text = formatCellText(c.get(row), c.format ?? "text");
      const truncated = truncateToWidth(text, CHAR_WIDTH, colWidths[i] - 6, "...");
      page.drawText(truncated, {
        x: x + 3,
        y: rowY,
        size: FONT_SIZE,
        font: regular,
        color: ink,
      });
      x += colWidths[i];
    });
    rowY -= ROW_H;
    rowsOnPage += 1;
  };

  if (rows.length === 0) {
    page.drawText("Tidak ada data", {
      x: MARGIN,
      y: rowY,
      size: FONT_SIZE,
      font: regular,
      color: muted,
    });
    rowY -= ROW_H;
    rowsOnPage = 1;
  } else {
    for (const row of rows) {
      if (rowsOnPage >= MAX_ROWS_PER_PAGE) {
        page = pdf.addPage(A4_LANDSCAPE);
        drawHeader(page);
        rowY = page.getHeight() - MARGIN - HEADER_H - ROW_H;
        rowsOnPage = 0;
      }
      drawRow(row);
    }
  }

  if (meta.footnote) {
    page.drawText(meta.footnote, {
      x: MARGIN,
      y: MARGIN + 6,
      size: FONT_SIZE,
      font: regular,
      color: muted,
    });
  }

  const pageCount = pdf.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const pg = pdf.getPage(i);
    pg.drawText(`Hal ${i + 1}/${pageCount}`, {
      x: MARGIN + contentWidth - 60,
      y: MARGIN / 2,
      size: 8,
      font: regular,
      color: muted,
    });
  }

  return saveUncompressed(pdf);
}

/**
 * pdf-lib selalu mengompres content stream dengan FlateDecode, sehingga teks
 * tidak muncul mentah di byte PDF. Untuk memudahkan inspeksi/assert teks
 * (mis. pada test), kita ganti setiap content stream dengan versi tak
 * terkompresi sebelum disimpan.
 */
async function saveUncompressed(pdf: PDFDocument): Promise<Uint8Array> {
  const context = pdf.context as unknown as PDFContext;
  for (const [ref, object] of context.enumerateIndirectObjects() as [PDFRef, unknown][]) {
    if (object instanceof PDFContentStream) {
      const stream = object as unknown as {
        dict: Parameters<typeof PDFContentStream.of>[0];
        operators: PDFOperator[];
      };
      const uncompressed = PDFContentStream.of(stream.dict, stream.operators, false);
      context.assign(ref, uncompressed);
    }
  }
  return pdf.save({ useObjectStreams: false });
}
