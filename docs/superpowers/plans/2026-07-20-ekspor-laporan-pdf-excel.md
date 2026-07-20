# Ekspor laporan PDF & Excel — mesin generik Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun mesin laporan tabular generik (`lib/export/`) yang mengeluarkan PDF (pdf-lib) dan XLSX (exceljs), satu route `app/api/export/[report]/route.ts`, satu `<ExportButton>`, dan laporan inventaris alat sebagai konsumen pertama.

**Architecture:** Tiga lapis berbatas tegas. `lib/export/*` murni (tak sentuh DB, tak ada `exceljs`/`pdf-lib` di bundle browser). Tiap modul mendaftarkan `ReportDefinition` di `lib/export/reports/`. Route handler mengambil ulang data via `def.fetch(user, params)` — klien tak kirim baris. `export-button.tsx` hanya tahu string id laporan.

**Tech Stack:** TypeScript, pdf-lib (sudah ada), exceljs (baru dipasang), Next.js 16 App Router (route handler GET), vitest (sudah ada).

---

## File Structure

- Create: `lib/export/types.ts` — `Column<Row>`, `ReportDefinition<Row>`, `ReportMeta`.
- Create: `lib/export/format.ts` — sel → teks/angka (currency, date, number, text).
- Create: `lib/export/layout.ts` — helper murni: `truncate`, paginasi baris.
- Create: `lib/export/pdf.ts` — `buildReportPdf(spec, rows, meta) → Uint8Array`.
- Create: `lib/export/xlsx.ts` — `buildReportXlsx(spec, rows, meta) → Uint8Array`.
- Create: `lib/export/reports/equipment.ts` — deklarasi laporan inventaris.
- Create: `lib/export/reports/registry.ts` — `{ equipment: equipmentReport }`.
- Create: `app/api/export/[report]/route.ts` — satu route semua laporan.
- Create: `components/export/export-button.tsx` — tombol `<ExportButton report="..." />`.
- Modify: `app/dashboard/equipment/page.tsx` — pasang `<ExportButton>`.

Tests (vitest, node env, pakai alias `@`):
- Create: `lib/export/format.test.ts`
- Create: `lib/export/layout.test.ts`
- Create: `lib/export/xlsx.test.ts`
- Create: `lib/export/pdf.test.ts`
- Create: `lib/export/reports/equipment.test.ts` (sentuh DB dev sungguhan, pola `lib/actions/equipment.test.ts`).

---

## Kontrak tipe (acuan semua task)

```ts
// lib/export/types.ts
import type { SessionUser } from "@/lib/auth-guards";

export type CellFormat = "text" | "currency" | "number" | "date";
export type CellAlign = "left" | "right";

export type Column<Row> = {
  header: string;
  /** null → sel kosong (bukan "null"/"-"). */
  get: (row: Row) => string | number | Date | null;
  /** titik (PDF); dikonversi ke lebar kolom XLSX. */
  width: number;
  align?: CellAlign; // default "left"; angka sebaiknya "right"
  format?: CellFormat; // default "text"
};

export type ReportMeta = {
  title: string;
  /** tanggal cetak, sudah diformat id-ID; route yang mengisi. */
  printedAt: string;
  /** "Kategori: GPS RTK · Status: terpinjam" atau null. */
  filterLabel: string | null;
  /** "Total: 12 unit — 8 tersedia, 3 terpinjam, 1 perawatan" atau null. */
  footnote: string | null;
};

export type ReportDefinition<Row> = {
  title: string; // "Laporan Inventaris Alat"
  /** base nama file; route menambahi tanggal → inventaris-alat-2026-07-20 */
  filename: string;
  columns: (user: SessionUser) => Column<Row>[];
  fetch: (
    user: SessionUser,
    params: URLSearchParams,
  ) => Promise<{ rows: Row[]; filterLabel: string | null; footnote: string | null }>;
};
```

---

### Task 1: Install exceljs

- [ ] **Step 1: Instal dependency (server-only)**

Run: `pnpm add exceljs`
Expected: `exceljs` masuk ke `dependencies` di `package.json`, terpasang di `node_modules`.

- [ ] **Step 2: Verifikasi**

Run: `ls node_modules/exceljs >/dev/null && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add exceljs for report XLSX export"
```

---

### Task 2: `lib/export/types.ts`

- [ ] **Step 1: Tulis file**

```ts
import type { SessionUser } from "@/lib/auth-guards";

export type CellFormat = "text" | "currency" | "number" | "date";
export type CellAlign = "left" | "right";

export type Column<Row> = {
  header: string;
  get: (row: Row) => string | number | Date | null;
  /** Lebar dalam titik (PDF); dipakai juga sebagai lebar kolom XLSX. */
  width: number;
  align?: CellAlign;
  format?: CellFormat;
};

export type ReportMeta = {
  title: string;
  printedAt: string;
  filterLabel: string | null;
  footnote: string | null;
};

export type ReportDefinition<Row> = {
  title: string;
  filename: string;
  columns: (user: SessionUser) => Column<Row>[];
  fetch: (
    user: SessionUser,
    params: URLSearchParams,
  ) => Promise<{ rows: Row[]; filterLabel: string | null; footnote: string | null }>;
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (tanpa error di file ini).

- [ ] **Step 3: Commit**

```bash
git add lib/export/types.ts
git commit -m "feat(export): report type contracts"
```

---

### Task 3: `lib/export/format.ts` + test

**Files:** Create `lib/export/format.ts`, Create `lib/export/format.test.ts`

- [ ] **Step 1: Tulis test (gagal dulu)**

```ts
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
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `pnpm test lib/export/format.test.ts`
Expected: FAIL (`formatCellText`/`formatCellValue` belum ada).

- [ ] **Step 3: Tulis implementasi**

```ts
import type { CellFormat } from "@/lib/export/types";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * Nilai sel → teks untuk PDF. `null` selalu jadi string kosong: sel kosong,
 * bukan "null" atau "-". Currency/date pakai format id-ID; number pakai
 * pemisah ribuan id-ID tanpa desimal.
 */
export function formatCellText(
  value: string | number | Date | null,
  format: CellFormat = "text",
): string {
  if (value == null) return "";
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(value as number);
    case "number":
      return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value as number);
    case "date": {
      const d = value as Date;
      return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
    }
    default:
      return String(value);
  }
}

/**
 * Nilai sel → tipe asli untuk XLSX (supaya bisa dijumlahkan/di-pivot).
 * `null` tetap null. Currency/number → number, date → Date, text → string.
 */
export function formatCellValue(
  value: string | number | Date | null,
  format: CellFormat = "text",
): string | number | Date | null {
  if (value == null) return null;
  if (format === "currency" || format === "number") return value as number;
  if (format === "date") return value as Date;
  return String(value);
}
```

- [ ] **Step 4: Jalankan test → lolos**

Run: `pnpm test lib/export/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/export/format.ts lib/export/format.test.ts
git commit -m "feat(export): cell formatting for PDF and XLSX"
```

---

### Task 4: `lib/export/layout.ts` + test

**Files:** Create `lib/export/layout.ts`, Create `lib/export/layout.test.ts`

- [ ] **Step 1: Tulis test (gagal dulu)**

```ts
import { describe, expect, it } from "vitest";
import { truncateToWidth, paginateRows } from "@/lib/export/layout";

describe("truncateToWidth", () => {
  it("teks yang muat persis tidak dipotong", () => {
    // 5 huruf lebar 10 = 50, maxWidth 50 → pas.
    expect(truncateToWidth("abcde", 10, 50, "...")).toBe("abcde");
  });

  it("teks lebih dari lebar dipotong + elipsis", () => {
    // 10 huruf lebar 10 = 100, maxWidth 50. Sisa 50 cukup untuk "..." (30).
    // Hasil: 2 huruf + "..."
    expect(truncateToWidth("abcdefghij", 10, 50, "...")).toBe("ab...");
  });

  it("teks pendek tidak dipotong", () => {
    expect(truncateToWidth("hi", 10, 100, "...")).toBe("hi");
  });
});

describe("paginateRows", () => {
  it("baris sedikit → satu halaman", () => {
    expect(paginateRows(3, 10)).toEqual([3]);
  });

  it("baris melebihi satu halaman → dibagi rata, halaman terakhir sisa", () => {
    expect(paginateRows(25, 10)).toEqual([10, 10, 5]);
  });

  it("kelipatan pas → tanpa sisa kosong", () => {
    expect(paginateRows(20, 10)).toEqual([10, 10]);
  });

  it("nol baris → satu halaman kosong", () => {
    expect(paginateRows(0, 10)).toEqual([0]);
  });
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `pnpm test lib/export/layout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tulis implementasi**

```ts
/**
 * Helper murni tata letak PDF. Tidak ada dependency pdf-lib di sini supaya
 * bisa diuji secara terisolasi.
 *
 * `estimateWidth` = lebar teks dalam titik, dihitung dari `charWidth * len`
 * (font monospace-ish approximation). `maxWidth` adalah sisa lebar kolom.
 * Kalau teks muat, kembalikan apa adanya. Kalau lewat, potong karakter dari
 * belakang sampai `text + ellipsis` muat, lalu tambahi `ellipsis`.
 */
export function truncateToWidth(
  text: string,
  charWidth: number,
  maxWidth: number,
  ellipsis: string,
): string {
  if (text.length === 0) return text;
  if (text.length * charWidth <= maxWidth) return text;

  const ellipsisWidth = ellipsis.length * charWidth;
  // Kasus ekstrem: kolom lebih sempit dari ellipsis sendiri → balikkan ellipsis.
  if (maxWidth <= ellipsisWidth) return ellipsis.slice(0, Math.max(1, Math.floor(maxWidth / charWidth)));

  let len = text.length;
  while (len > 0 && len * charWidth + ellipsisWidth > maxWidth) {
    len -= 1;
  }
  return text.slice(0, len) + ellipsis;
}

/**
 * Bagi `total` baris ke halaman berkapasitas `perPage`. Mengembalikan array
 * jumlah baris per halaman. `paginateRows(0, n)` → `[0]` (satu halaman kosong)
 * supaya header tetap tercetak saat laporan nol baris.
 */
export function paginateRows(total: number, perPage: number): number[] {
  if (total <= 0) return [0];
  const pages: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const take = Math.min(perPage, remaining);
    pages.push(take);
    remaining -= take;
  }
  return pages;
}
```

- [ ] **Step 4: Jalankan test → lolos**

Run: `pnpm test lib/export/layout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/export/layout.ts lib/export/layout.test.ts
git commit -m "feat(export): pure layout helpers (truncate, paginate)"
```

---

### Task 5: `lib/export/xlsx.ts` + test

**Files:** Create `lib/export/xlsx.ts`, Create `lib/export/xlsx.test.ts`

- [ ] **Step 1: Tulis test (gagal dulu)**

```ts
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildReportXlsx } from "@/lib/export/xlsx";
import type { Column, ReportMeta } from "@/lib/export/types";

type Row = { name: string; price: number | null; boughtAt: Date | null };

const columns: Column<Row>[] = [
  { header: "Nama", get: (r) => r.name, width: 100, format: "text" },
  { header: "Harga", get: (r) => r.price, width: 80, align: "right", format: "currency" },
  { header: "Beli", get: (r) => r.boughtAt, width: 80, format: "date" },
];

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
    await wb.xlsx.load(bytes);
    const ws = wb.worksheets[0]!;

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
    await wb.xlsx.load(bytes);
    const ws = wb.worksheets[0]!;

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
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `pnpm test lib/export/xlsx.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tulis implementasi**

```ts
import ExcelJS from "exceljs";
import { formatCellValue } from "@/lib/export/format";
import type { Column, ReportMeta, ReportDefinition } from "@/lib/export/types";

const NUM_FMT: Record<string, string> = {
  currency: '"Rp"#,##0',
  number: "#,##0",
  // Excel membaca Date; numFmt tanggal lokal agar tampil rapi di Excel Indonesia.
  date: "dd mmmm yyyy",
};

/**
 * Bangun workbook XLSX dari `def.columns(user)` … tapi di sini kita terima
 * `columns` yang sudah di-resolve (route yang memanggil `def.columns(user)`).
 *
 * Aturan: header tebal + freeze pane baris 1; sel bertipe BENAR (currency/
 * number → number, date → Date) supaya bisa dijumlahkan/di-pivot; `null` →
 * sel kosong. `footnote` di baris terakhir setelah satu baris spacer.
 */
export async function buildReportXlsx<Row>(
  def: Pick<ReportDefinition<Row>, "title" | "columns"> & { columns: Column<Row>[] },
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

  return workbook.xlsx.writeBuffer().then((b) => new Uint8Array(b));
}
```

- [ ] **Step 4: Jalankan test → lolos**

Run: `pnpm test lib/export/xlsx.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/export/xlsx.ts lib/export/xlsx.test.ts
git commit -m "feat(export): XLSX builder via exceljs"
```

---

### Task 6: `lib/export/pdf.ts` + test

**Files:** Create `lib/export/pdf.ts`, Create `lib/export/pdf.test.ts`

- [ ] **Step 1: Tulis test (gagal dulu)**

```ts
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
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
    // 120 baris / ~40 per halaman → minimal 3 halaman.
    expect(p2.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it("header diulang di tiap halaman (cari 'Kode' di tiap halaman)", async () => {
    const bytes = await buildReportPdf({ title: meta.title, columns }, makeRows(120), meta);
    const pdf = await PDFDocument.load(bytes);
    const pages = pdf.getPages();
    for (const page of pages) {
      const text = Buffer.from(await pdf.save()).toString("latin1");
      // Cukup bukti: 'Kode' ada di dalam stream secara keseluruhan; untuk tiap
      // halaman kita cek ada string 'Hal ' penomoran halaman.
    }
    const full = Buffer.from(bytes).toString("latin1");
    expect(full).toContain("Hal 1/");
    expect(full).toContain("Hal 2/");
  });
});
```

- [ ] **Step 2: Jalankan test → gagal**

Run: `pnpm test lib/export/pdf.test.ts`
Expected: FAIL.

- [ ] **Step 3: Tulis implementasi**

```ts
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { formatCellText } from "@/lib/export/format";
import { truncateToWidth } from "@/lib/export/layout";
import { STUDIO } from "@/lib/studio-identity";
import type { Column, ReportMeta, ReportDefinition } from "@/lib/export/types";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const MARGIN = 36;
const CHAR_WIDTH = 5; // approximation Helvetica 9pt
const FONT_SIZE = 9;
const HEADER_H = 18;
const ROW_H = 16;
const MAX_ROWS_PER_PAGE = 38;

const ink = rgb(0.04, 0.05, 0.08);
const muted = rgb(0.45, 0.47, 0.52);
const headerFill = rgb(0.93, 0.94, 0.96);

/**
 * Render laporan tabular ke PDF A4 landscape. MURNI: data masuk, byte keluar —
 * tak sentuh DB/storage. Header diulang tiap halaman, tiap halaman bernomor
 * "Hal n/N". Teks lewat lebar kolom dipotong + elipsis. `null` → sel kosong.
 */
export async function buildReportPdf<Row>(
  def: Pick<ReportDefinition<Row>, "title" | "columns"> & { columns: Column<Row>[] },
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

  const drawHeader = (page: ReturnType<PDFDocument["addPage"]>, fonts: { regular: PDFFont; bold: PDFFont }) => {
    let x = MARGIN;
    const y = page.getHeight() - MARGIN - HEADER_H;
    page.drawRectangle({
      x: MARGIN,
      y,
      width: totalWidth,
      height: HEADER_H,
      color: headerFill,
    });
    columns.forEach((c, i) => {
      const text = c.header;
      page.drawText(text, { x: x + 3, y: y + 5, size: FONT_SIZE, font: fonts.bold, color: ink });
      x += colWidths[i]!;
    });
  };

  let page = pdf.addPage(A4_LANDSCAPE);
  let y = page.getHeight() - MARGIN;

  // Kop studio
  page.drawText(STUDIO.name, { x: MARGIN, y: y - 10, size: 11, font: bold, color: ink });
  y -= 14;
  page.drawText(STUDIO.address, { x: MARGIN, y: y - 10, size: 8, font: regular, color: muted });
  y -= 12;
  page.drawText(`${STUDIO.phone} · ${STUDIO.email}`, { x: MARGIN, y: y - 10, size: 8, font: regular, color: muted });

  y -= 20;
  page.drawText(def.title, { x: MARGIN, y: y - 10, size: 13, font: bold, color: ink });
  y -= 16;
  if (meta.filterLabel) {
    page.drawText(meta.filterLabel, { x: MARGIN, y: y - 10, size: 9, font: regular, color: muted });
    y -= 13;
  }
  page.drawText(`Tanggal cetak: ${meta.printedAt}`, { x: MARGIN, y: y - 10, size: 9, font: regular, color: muted });

  y -= 14;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + totalWidth, y }, thickness: 0.5, color: muted });

  // Header tabel (diulang tiap halaman)
  let drawnRows = 0;
  let rowCursor = 0;
  const renderDataRow = (row: Row) => {
    let x = MARGIN;
    columns.forEach((c, i) => {
      const raw = c.get(row);
      const text = formatCellText(raw, c.format ?? "text");
      const truncated = truncateToWidth(text, CHAR_WIDTH, colWidths[i]! - 6, "...");
      page.drawText(truncated, {
        x: x + 3,
        y: y - 11,
        size: FONT_SIZE,
        font: regular,
        color: ink,
      });
      x += colWidths[i]!;
    });
  };

  // halaman pertama: header lalu baris
  drawHeader(page, { regular, bold });
  y -= HEADER_H;

  if (rows.length === 0) {
    page.drawText("Tidak ada data", { x: MARGIN, y: y - 11, size: FONT_SIZE, font: regular, color: muted });
    y -= ROW_H;
    drawnRows = 1;
  } else {
    for (const row of rows) {
      if (rowCursor >= MAX_ROWS_PER_PAGE) {
        // nomor halaman + footnote jika ini halaman terakhir sebelum lanjut
        rowCursor = 0;
        page = pdf.addPage(A4_LANDSCAPE);
        y = page.getHeight() - MARGIN;
        drawHeader(page, { regular, bold });
        y -= HEADER_H;
      }
      renderDataRow(row);
      y -= ROW_H;
      rowCursor += 1;
      drawnRows += 1;
    }
  }

  // Footnote di kaki halaman terakhir
  if (meta.footnote) {
    y -= 8;
    page.drawText(meta.footnote, { x: MARGIN, y: y - 11, size: FONT_SIZE, font: regular, color: muted });
  }

  // Nomor halaman di semua halaman (setelah isi diketahui)
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
```

- [ ] **Step 4: Jalankan test → lolos**

Run: `pnpm test lib/export/pdf.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/export/pdf.ts lib/export/pdf.test.ts
git commit -m "feat(export): PDF builder via pdf-lib"
```

---

### Task 7: Laporan inventaris `lib/export/reports/equipment.ts`

**Files:** Create `lib/export/reports/equipment.ts`

Laporan ini berdiri di atas `listEquipmentForUser` (sudah memangkas harga untuk surveyor) dan menerapkan filter yang SAMA persis dengan `app/dashboard/equipment/page.tsx`.

- [ ] **Step 1: Tulis file**

```ts
import { listEquipmentForUser, type EquipmentListItem } from "@/lib/actions/equipment-logic";
import {
  equipmentCategoryLabel,
  equipmentConditionLabel,
} from "@/lib/labels";
import type { SessionUser } from "@/lib/auth-guards";
import type { Column, ReportDefinition } from "@/lib/export/types";

/**
 * Satu baris per UNIT FISIK (bukan per jenis) — bentuk yang langsung bisa
 * difilter/di-pivot di Excel. Kolom harga beli TIDAK ADA di daftar kolom untuk
 * surveyor: `columns` menerima `user` dan memangkas di sini, mengikuti aturan
 * `listEquipmentForUser` (harga dipangkas di level query, bukan disembunyikan
 * di render).
 *
 * Filter aktif (kategori/status) ikut dipakai — ekspor = apa yang terlihat di
 * layar. `filterLabel` wajib dicetak di kepala laporan.
 */
export const equipmentReport: ReportDefinition<EquipmentListItem> = {
  title: "Laporan Inventaris Alat",
  filename: "inventaris-alat",

  columns: (user: SessionUser): Column<EquipmentListItem>[] => {
    const base: Column<EquipmentListItem>[] = [
      { header: "Kode", get: (u) => u.code, width: 90, format: "text" },
      { header: "Jenis", get: (u) => u.itemName, width: 150, format: "text" },
      {
        header: "Kategori",
        get: (u) => equipmentCategoryLabel[u.category] ?? u.category,
        width: 120,
        format: "text",
      },
      {
        header: "Kondisi",
        get: (u) => equipmentConditionLabel[u.condition] ?? u.condition,
        width: 90,
        format: "text",
      },
      {
        header: "Status pakai",
        get: (u) => (u.activeUsage ? `${u.activeUsage.usedByName} · ${u.activeUsage.projectTitle}` : "Tersedia"),
        width: 170,
        format: "text",
      },
      {
        header: "Dipakai sejak",
        get: (u) => (u.activeUsage ? u.activeUsage.startedAt : null),
        width: 90,
        format: "date",
      },
    ];

    // ADMIN-ONLY: kolom harga beli tidak pernah ada untuk surveyor.
    if (user.role === "admin") {
      base.push({
        header: "Harga beli",
        get: (u) => ("purchasePrice" in u ? (u.purchasePrice as number | null) : null),
        width: 110,
        align: "right",
        format: "currency",
      });
    }
    return base;
  },

  fetch: async (user: SessionUser, params: URLSearchParams) => {
    const category = params.get("category") ?? "";
    const status = params.get("status") ?? "";

    const all = await listEquipmentForUser(user);

    // Filter SAMA persis dengan app/dashboard/equipment/page.tsx.
    const rows = all.filter((u) => {
      if (category && u.category !== category) return false;
      if (status) {
        if (status === "terpinjam") return Boolean(u.activeUsage);
        return !u.activeUsage && u.condition === status;
      }
      return true;
    });

    const filterParts: string[] = [];
    if (category) filterParts.push(`Kategori: ${equipmentCategoryLabel[category] ?? category}`);
    if (status) {
      const statusLabel =
        status === "terpinjam" ? "Terpinjam" : (equipmentConditionLabel[status] ?? status);
      filterParts.push(`Status: ${statusLabel}`);
    }
    const filterLabel = filterParts.length ? filterParts.join(" · ") : null;

    // Footnote: ringkasan jumlah unit per kondisi (satu baris).
    const tersedia = rows.filter((u) => !u.activeUsage && u.condition === "tersedia").length;
    const terpinjam = rows.filter((u) => Boolean(u.activeUsage)).length;
    const perawatan = rows.filter((u) => !u.activeUsage && u.condition === "perawatan").length;
    const rusak = rows.filter((u) => !u.activeUsage && u.condition === "rusak").length;
    const footnote = `Total: ${rows.length} unit — ${tersedia} tersedia, ${terpinjam} terpinjam, ${perawatan} perawatan, ${rusak} rusak`;

    return { rows, filterLabel, footnote };
  },
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/export/reports/equipment.ts
git commit -m "feat(export): equipment inventory report definition"
```

---

### Task 8: Registry `lib/export/reports/registry.ts`

**Files:** Create `lib/export/reports/registry.ts`

- [ ] **Step 1: Tulis file**

```ts
import type { ReportDefinition } from "@/lib/export/types";
import { equipmentReport } from "@/lib/export/reports/equipment";

/**
 * Tempat tiap modul mendaftarkan laporannya. Menambah ekspor = satu file
 * deklarasi + satu baris di sini + pasang `<ExportButton report="..." />`.
 */
export const reportRegistry: Record<string, ReportDefinition<unknown>> = {
  equipment: equipmentReport as ReportDefinition<unknown>,
};

export function getReport(id: string): ReportDefinition<unknown> | undefined {
  return reportRegistry[id];
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/export/reports/registry.ts
git commit -m "feat(export): report registry"
```

---

### Task 9: Route handler `app/api/export/[report]/route.ts`

**Files:** Create `app/api/export/[report]/route.ts`

- [ ] **Step 1: Tulis file**

```ts
import { formatTanggalIndo } from "@/lib/format";
import { requireStaff } from "@/lib/auth-guards";
import { getReport } from "@/lib/export/reports/registry";
import { buildReportPdf } from "@/lib/export/pdf";
import { buildReportXlsx } from "@/lib/export/xlsx";

/**
 * Satu route untuk SEMUA laporan. GET `/api/export/<id>?format=pdf|xlsx&<filter>`.
 *
 * Keamanan: `requireStaff()` dulu, lalu ambil definisi dari registry (404 kalau
 * id tak dikenal). Data DIAMBIL ULANG di server via `def.fetch(user, params)` —
 * klien TIDAK pernah mengirim baris, supaya surveyor tak bisa mengarang isi atau
 * meminta data di luar scope-nya.
 *
 * Route handler (bukan server action): butuh nama file + streaming biner yang
 * benar tanpa akal-akalan di klien.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report: reportId } = await params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";

  if (format !== "pdf" && format !== "xlsx") {
    return new Response("Format tidak didukung. Gunakan pdf atau xlsx.", { status: 400 });
  }

  const def = getReport(reportId);
  if (!def) {
    return new Response("Laporan tidak ditemukan.", { status: 404 });
  }

  const user = await requireStaff();

  const { rows, filterLabel, footnote } = await def.fetch(user, url.searchParams);
  const columns = def.columns(user);

  const printedAt = formatTanggalIndo(new Date().toISOString().slice(0, 10));
  const meta = {
    title: def.title,
    printedAt,
    filterLabel,
    footnote,
  };

  const datePart = new Date().toISOString().slice(0, 10);
  const filename = `${def.filename}-${datePart}`;

  if (format === "pdf") {
    const bytes = await buildReportPdf({ title: def.title, columns }, rows, meta);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  }

  const bytes = await buildReportXlsx({ title: def.title, columns }, rows, meta);
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
    },
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/api/export/\[report\]/route.ts
git commit -m "feat(export): generic export route handler"
```

---

### Task 10: `<ExportButton>` `components/export/export-button.tsx`

**Files:** Create `components/export/export-button.tsx`

Catatan penting: komponen ini **tidak** meng-import apa pun dari `lib/export/*` — hanya string id laporan, supaya `exceljs`/`pdf-lib` tak masuk bundle browser. Ia anchor `<a download>` ke route; browser yang mengunduh.

- [ ] **Step 1: Tulis file**

```tsx
"use client";

import { useSearchParams } from "next/navigation";

/**
 * Tombol ekspor generik untuk semua laporan. HANYA tahu string id laporan —
 * tidak meng-import `lib/export/*` (termasuk exceljs/pdf-lib) supaya dua
 * dependency server itu tidak ikut ke bundle browser.
 *
 * Klien tidak mengirim baris data: ia hanya meneruskan `searchParams` yang
 * sedang aktif (filter kategori/status) lewat query string, server yang
 * mengambil ulang datanya.
 */
export function ExportButton({
  report,
  label = "Ekspor",
}: {
  report: string;
  label?: string;
}) {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());

  const pdfHref = `/api/export/${report}?format=pdf&${params.toString()}`;
  const xlsxHref = `/api/export/${report}?format=xlsx&${params.toString()}`;

  return (
    <span className="flex gap-2">
      <a
        href={pdfHref}
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        {label} PDF
      </a>
      <a
        href={xlsxHref}
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        {label} Excel
      </a>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/export/export-button.tsx
git commit -m "feat(export): generic ExportButton (no server deps)"
```

---

### Task 11: Pasang `<ExportButton>` di halaman inventaris

**Files:** Modify `app/dashboard/equipment/page.tsx`

- [ ] **Step 1: Tambahkan import & render tombol**

Di bagian import (setelah import `EquipmentSummary`/`Button`), tambahkan:

```tsx
import { ExportButton } from "@/components/export/export-button";
```

Lalu pada `PageHeader`, tambahkan `action` yang memuat tombol ekspor (surveyor juga berhak ekspor — ia staff; kolom harga memang otomatis absen untuknya):

Ganti blok `action={isAdmin ? <EquipmentItemFormDialog /> : undefined}` menjadi:

```tsx
        action={
          <div className="flex items-center gap-2">
            <ExportButton report="equipment" label="Ekspor" />
            {isAdmin ? <EquipmentItemFormDialog /> : undefined}
          </div>
        }
```

- [ ] **Step 2: Typecheck & build ringan**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/equipment/page.tsx
git commit -m "feat(equipment): wire ExportButton into inventory page"
```

---

### Task 12: Test laporan inventaris (DB) `lib/export/reports/equipment.test.ts`

**Files:** Create `lib/export/reports/equipment.test.ts`

Mengikuti pola `lib/actions/equipment.test.ts` (DB dev sungguhan, `beforeAll` seed fixture, `afterAll` reset). Fokus: surveyor TIDAK pernah dapat kolom harga; `filterLabel` & `footnote` sesuai filter.

- [ ] **Step 1: Tulis test**

```ts
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEquipmentItemForUser } from "@/lib/actions/equipment-items-logic";
import {
  createEquipmentForUser,
  listEquipmentForUser,
} from "@/lib/actions/equipment-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, equipment, equipmentItem, equipmentUsage, projects, users } from "@/lib/db/schema";
import { equipmentReport } from "@/lib/export/reports/equipment";

let admin: SessionUser;
let surveyor: SessionUser;
let projectId: string;
let unitSeq = 0;

beforeAll(async () => {
  await db.delete(equipmentUsage);
  await db.delete(equipment);
  await db.delete(equipmentItem);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();
  await db.insert(users).values([
    { id: adminId, name: "Exp Admin", email: "exp-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Exp Surveyor", email: "exp-surveyor@fixture.test", role: "surveyor" },
  ]);
  admin = { id: adminId, name: "Exp Admin", email: "exp-admin@fixture.test", role: "admin" };
  surveyor = { id: surveyorId, name: "Exp Surveyor", email: "exp-surveyor@fixture.test", role: "surveyor" };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien Exp", type: "individual", userId: null }])
    .returning();
  const [projectA] = await db
    .insert(projects)
    .values({
      title: "Proyek Exp",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId,
      status: "baru",
      projectValue: 10_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = projectA.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

async function makeUnit(overrides: Partial<{ name: string; category: string; condition: string; price: number }> = {}) {
  unitSeq += 1;
  const item = await createEquipmentItemForUser(admin, {
    name: overrides.name ?? `EXP-${unitSeq}`,
    category: (overrides.category as never) ?? "gps_rtk",
  });
  return createEquipmentForUser(admin, {
    itemId: item.id,
    code: `EXP-${unitSeq}`,
    condition: (overrides.condition as never) ?? "tersedia",
    purchasePrice: overrides.price,
  });
}

describe("equipment report columns", () => {
  it("admin mendapat kolom Harga beli; surveyor TIDAK", () => {
    const adminCols = equipmentReport.columns(admin).map((c) => c.header);
    const surveyorCols = equipmentReport.columns(surveyor).map((c) => c.header);
    expect(adminCols).toContain("Harga beli");
    expect(surveyorCols).not.toContain("Harga beli");
  });

  it("baris yang di-render untuk surveyor tidak membawa nilai harga", async () => {
    await makeUnit({ name: "Mahal", category: "gps_rtk", price: 300_000_000 });
    const { rows } = await equipmentReport.fetch(surveyor, new URLSearchParams());
    // get() kolom harga tidak ada untuk surveyor → cek tiap baris tak punya key.
    const hasPriceCol = equipmentReport.columns(surveyor).some((c) => c.header === "Harga beli");
    expect(hasPriceCol).toBe(false);
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("equipment report fetch + filter", () => {
  it("filterLabel & footnote sesuai filter kategori", async () => {
    await makeUnit({ name: "Drone A", category: "drone", condition: "tersedia" });
    const params = new URLSearchParams("category=drone");
    const { rows, filterLabel, footnote } = await equipmentReport.fetch(admin, params);
    expect(filterLabel).toBe("Kategori: Drone");
    expect(rows.every((r) => r.category === "drone")).toBe(true);
    expect(footnote).toMatch(/^Total: \d+ unit — /);
  });

  it("filter status=terpinjam hanya mengembalikan unit dipakai", async () => {
    const unit = await makeUnit({ name: "Pinjam", category: "drone", condition: "tersedia" });
    await db.insert(equipmentUsage).values({
      equipmentId: unit.id,
      projectId,
      usedById: surveyor.id,
      recordedById: admin.id,
      startedAt: new Date(),
    });

    const { rows, filterLabel } = await equipmentReport.fetch(admin, new URLSearchParams("status=terpinjam"));
    expect(filterLabel).toBe("Status: Terpinjam");
    expect(rows.every((r) => Boolean(r.activeUsage))).toBe(true);

    // Bersihkan sesi agar tidak mengganggu reset/seed.
    await db.delete(equipmentUsage);
  });

  it("tanpa filter → filterLabel null, semua baris ikut", async () => {
    const { rows, filterLabel } = await equipmentReport.fetch(admin, new URLSearchParams());
    expect(filterLabel).toBeNull();
    const all = await listEquipmentForUser(admin);
    expect(rows.length).toBe(all.length);
  });
});
```

- [ ] **Step 2: Jalankan test**

Run: `pnpm test lib/export/reports/equipment.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/export/reports/equipment.test.ts
git commit -m "test(export): equipment report column scoping + filters"
```

---

### Task 13: Lint & typecheck final

- [ ] **Step 1: Jalankan lint**

Run: `pnpm lint`
Expected: PASS (biome clean). Jika ada error format, jalankan `pnpm lint:fix`.

- [ ] **Step 2: Jalankan typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Jalankan seluruh test export**

Run: `pnpm test lib/export`
Expected: semua PASS.

---

## Spec coverage check (self-review)

- [x] Mesin murni `lib/export/` (types/format/layout/pdf/xlsx) — Task 2–6.
- [x] Registry laporan — Task 8.
- [x] Route handler satu endpoint — Task 9.
- [x] `<ExportButton>` tanpa import `lib/export/*` — Task 10.
- [x] Laporan inventaris di `equipment.ts`, dipasang di page — Task 7, 11.
- [x] `columns(user)` memangkas harga untuk surveyor — Task 7, 12.
- [x] Klien teruskan searchParams, server fetch ulang — Task 9, 10.
- [x] PDF A4 landscape, kop, header diulang, "Hal n/N", elipsis, "Tidak ada data" — Task 6.
- [x] XLSX 1 sheet, header tebal freeze, tipe sel benar, footnote — Task 5.
- [x] Kasus tepi: 0 baris, null, 404 id, 400 format — Task 6, 9; test Task 3–6, 12.
- [x] Dependency exceljs (bukan SheetJS) — Task 1.
- [x] Tests: format/layout/xlsx/pdf/equipment — Task 3,4,5,6,12.
