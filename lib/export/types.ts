import type { Permission } from "@/lib/rbac/resources";
import type { RbacContext } from "@/lib/rbac/types";

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
  /** Izin yang harus dimiliki caller untuk mengekspor laporan ini. */
  permission: Permission;
  columns: (ctx: RbacContext) => Column<Row>[];
  fetch: (
    ctx: RbacContext,
    params: URLSearchParams,
  ) => Promise<{ rows: Row[]; filterLabel: string | null; footnote: string | null }>;
};
