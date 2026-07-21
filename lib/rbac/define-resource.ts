import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Scope, ScopeFn } from "./types";

/**
 * Verdict sebuah guard: `true` kalau boleh, atau pesan penolakan berbahasa
 * Indonesia yang akan ditampilkan ke user apa adanya.
 */
export type GuardVerdict = true | string;

type Row<T extends PgTable> = T["$inferSelect"];

export type ResourceDefinition<Name extends string, Action extends string, T extends PgTable> = {
  /** Segmen pertama nama permission. Tidak boleh mengandung titik. */
  name: Name;
  /** Segmen kedua. Tidak boleh mengandung titik, tidak boleh ganda. */
  actions: readonly Action[];
  /**
   * Tabel + kolom id-nya. Wajib kalau resource ini mau dipakai lewat
   * `rbacFilter` / `requireScopedRow`; resource "tanpa tabel" seperti
   * `profile` dan `report` hanya dipakai lewat `can()`.
   */
  table?: { table: T; id: PgColumn };
  /**
   * Arti tiap scope sebagai predikat SQL. Scope yang tidak didefinisikan =
   * tidak ada akses (fail-closed), BUKAN akses penuh.
   */
  scopes?: Partial<Record<Scope, ScopeFn>>;
  /** Kondisi per-status yang dicek `requireScopedRow` setelah baris diambil. */
  guards?: Partial<Record<Action, (row: Row<T>) => GuardVerdict>>;
  /** Kolom sensitif → permission yang dibutuhkan untuk melihatnya. */
  fields?: Partial<Record<keyof Row<T> & string, `${Name}.${Action}`>>;
};

export type Resource<
  Name extends string = string,
  Action extends string = string,
  T extends PgTable = PgTable,
> = ResourceDefinition<Name, Action, T> & {
  readonly permissions: readonly `${Name}.${Action}`[];
};

/**
 * Bentuk resource setelah tipenya dilupakan — dipakai engine (`resourceOf`,
 * `rbacFilter`, `requireScopedRow`, `redact`) yang menerima resource apa pun.
 *
 * `guards` sengaja memakai `row: any` di sini: dengan `strictFunctionTypes`,
 * `(row: Project) => …` TIDAK assignable ke `(row: PgTable["$inferSelect"]) => …`
 * (parameter bersifat kontravarian), jadi tanpa ini setiap resource nyata
 * gagal dilewatkan ke engine-nya sendiri.
 */
// biome-ignore lint/suspicious/noExplicitAny: lihat komentar di atas.
type AnyGuard = (row: any) => GuardVerdict;

export type AnyResource = {
  name: string;
  actions: readonly string[];
  table?: { table: PgTable; id: PgColumn };
  scopes?: Partial<Record<Scope, ScopeFn>>;
  guards?: Record<string, AnyGuard>;
  fields?: Record<string, string>;
  readonly permissions: readonly string[];
};

/**
 * Mendeklarasikan satu resource. Validasinya jalan saat modul dimuat, jadi
 * kesalahan penamaan meledak saat start — bukan diam-diam jadi permission
 * yang tidak pernah cocok saat request.
 */
export function defineResource<
  const Name extends string,
  const Action extends string,
  T extends PgTable,
>(def: ResourceDefinition<Name, Action, T>): Resource<Name, Action, T> {
  if (def.name.includes(".")) {
    throw new Error(`rbac: nama resource "${def.name}" tidak boleh mengandung titik.`);
  }

  const seen = new Set<string>();
  for (const action of def.actions) {
    if (action.includes(".")) {
      throw new Error(`rbac: action "${def.name}.${action}" tidak boleh mengandung titik.`);
    }
    if (seen.has(action)) {
      throw new Error(`rbac: action ganda "${action}" di resource "${def.name}".`);
    }
    seen.add(action);
  }

  const permissions = def.actions.map((action) => `${def.name}.${action}` as const);
  return { ...def, permissions };
}
