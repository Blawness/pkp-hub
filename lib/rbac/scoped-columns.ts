import { getTableColumns } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { can } from "./can";
import type { AnyResource } from "./define-resource";
import type { Permission } from "./resources";
import type { RbacContext } from "./types";

/**
 * Select-map Drizzle berisi SELURUH kolom tabel resource, MEMBUANG kolom yang
 * gating-permission-nya (dari `resource.fields`) tidak dimiliki `ctx`.
 *
 * Beda dengan `redact()`: kolom sensitif TIDAK pernah ikut ter-SELECT — bukan
 * diambil lalu dihapus. Menjaga invarian "bentuk hasil query, bukan
 * disembunyikan di UI" (PRD Feature 5/8/9). `fields` yang sama tetap menyetir
 * `redact()` untuk jalur baca satu-baris yang sudah terlanjur mengambil baris
 * penuh (mis. hasil `requireScopedRow`).
 */
export function scopedColumns(resource: AnyResource, ctx: RbacContext): Record<string, PgColumn> {
  if (!resource.table) {
    throw new Error(`rbac: resource "${resource.name}" tidak punya tabel.`);
  }
  const all = getTableColumns(resource.table.table) as Record<string, PgColumn>;
  if (!resource.fields) return all;

  const result: Record<string, PgColumn> = {};
  for (const [name, column] of Object.entries(all)) {
    const gate = resource.fields[name];
    if (gate && !can(ctx, gate as Permission)) continue;
    result[name] = column;
  }
  return result;
}
