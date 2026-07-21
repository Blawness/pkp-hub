import { can } from "./can";
import type { AnyResource } from "./define-resource";
import type { Permission } from "./resources";
import type { RbacContext } from "./types";

/**
 * Membuang kolom sensitif yang tidak boleh dilihat `ctx`.
 *
 * Mengembalikan `Partial<T>`, bukan `T`: kolomnya benar-benar HILANG, bukan
 * di-null-kan, dan tipenya jujur soal itu — konsumen dipaksa menangani
 * ketidakhadirannya, yang memang inti dari field-level. Baris aslinya tidak
 * diubah.
 */
export function redact<T extends Record<string, unknown>>(
  ctx: RbacContext,
  resource: AnyResource,
  row: T,
): Partial<T> {
  if (!resource.fields) return row;

  const result: Partial<T> = { ...row };
  for (const [field, permission] of Object.entries(resource.fields)) {
    if (!can(ctx, permission as Permission)) {
      delete result[field as keyof T];
    }
  }
  return result;
}
