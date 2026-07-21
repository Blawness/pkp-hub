import { type SQL, sql } from "drizzle-orm";
import { scopeOf } from "./can";
import { resourceOf, type ScopedPermission } from "./resources";
import type { RbacContext } from "./types";

/**
 * Predikat baris untuk sebuah izin. SELALU mengembalikan `SQL`, tidak pernah
 * `undefined`.
 *
 * Satu bentuk untuk semua kasus berarti ia langsung bisa masuk ke `and()`,
 * dan kasus "tidak punya izin" otomatis jadi `false` — himpunan kosong —
 * alih-alih bergantung pada pemanggil ingat menulis `if`. Lupa menanganinya
 * tetap aman.
 *
 *   db.select().from(projects)
 *     .where(and(rbacFilter(ctx, "project.read"), eq(projects.status, "aktif")))
 */
export function rbacFilter(ctx: RbacContext, permission: ScopedPermission): SQL {
  const scope = scopeOf(ctx, permission);
  if (!scope) return sql`false`;

  // Scope yang tidak didefinisikan resource-nya = tidak ada akses, BUKAN
  // akses penuh. Memberi grant `client.read:own` (yang tidak punya arti)
  // menghasilkan himpunan kosong, bukan seluruh tabel klien.
  const scopeFn = resourceOf(permission).scopes?.[scope];
  if (!scopeFn) return sql`false`;

  return scopeFn(ctx);
}
