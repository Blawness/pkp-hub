import ExcelJS from "exceljs";
import { formatCellValue } from "@/lib/export/format";
import type { Column, ReportDefinition, ReportMeta } from "@/lib/export/types";

const NUM_FMT: Record<string, string> = {
  currency: '"Rp"#,##0',
  number: "#,##0",
  // Excel membaca Date; numFmt tanggal lokal agar tampil rapi di Excel Indonesia.
  date: "dd mmmm yyyy",
};

/**
 * Bangun workbook XLSX dari kolom yang SUDAH di-resolve (route yang memanggil
 * `def.columns(user)`), supaya modul ini tidak perlu tahu soal sesi/role.
 *
 * Aturan: header tebal + freeze pane baris 1; sel bertipe BENAR (currency/
 * number → number, date → Date) supaya bisa dijumlahkan/di-pivot; `null` →
 * sel kosong. `footnote` di baris terakhir setelah satu baris spacer.
 */
export async function buildReportXlsx<Row>(
  def: Pick<ReportDefinition<Row>, "title"> & { columns: Column<Row>[] },
  rows: Row[],
  meta: ReportMeta,
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PKP Hub";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(def.title);

  const columns = def.columns;
  sheet.columns = columns.map((c) => ({
    header: c.header,
    width: c.width / 6, // titik → satuan kolom Excel (≈ 1/6")
  }));

  // Baris 1 = header (tebal). Freeze pane di bawahnya.
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    const values = columns.map((c) => formatCellValue(c.get(row), c.format ?? "text"));
    const excelRow = sheet.addRow(values);
    columns.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      const fmt = c.format ?? "text";
      if (NUM_FMT[fmt]) cell.numFmt = NUM_FMT[fmt];
      cell.alignment = { horizontal: c.align === "right" ? "right" : "left" };
    });
  }

  if (meta.footnote) {
    // Satu baris kosong lalu footnote.
    sheet.addRow([]);
    const noteRow = sheet.addRow([meta.footnote]);
    noteRow.font = { italic: true };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
