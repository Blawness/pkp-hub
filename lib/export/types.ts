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
