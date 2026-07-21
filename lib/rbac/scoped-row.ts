import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { AnyResource } from "./define-resource";
import { rbacFilter } from "./filter";
import { resourceOf, type ScopedPermission } from "./resources";
import type { RbacContext } from "./types";

/** Menjalankan guard sebuah action terhadap baris yang sudah diambil. */
export function checkGuard(
  resource: AnyResource,
  action: string,
  row: Record<string, unknown>,
): void {
  const guard = resource.guards?.[action];
  if (!guard) return;
  const verdict = guard(row);
  if (verdict !== true) throw new Error(verdict);
}

/**
 * Satu baris, hanya kalau `ctx` boleh melihatnya.
 *
 * Query-nya memakai `rbacFilter` YANG SAMA dengan jalur daftar — bukan
 * predikat JS terpisah. Itulah yang membunuh permanen bug "guard dan daftar
 * beda aturan" yang diwanti-wanti komentar di `lib/auth-guards.ts`: aturan
 * scope hanya ditulis sekali, di `lib/rbac/resources/<x>.ts`.
 *
 * `notFound()` dipakai untuk baris yang tidak ada MAUPUN yang bukan miliknya
 * — respons tidak boleh membedakan keduanya.
 */
export async function requireScopedRow(
  ctx: RbacContext,
  permission: ScopedPermission,
  id: string,
): Promise<Record<string, unknown>> {
  const resource = resourceOf(permission);
  if (!resource.table) {
    throw new Error(`rbac: resource "${resource.name}" tidak punya tabel.`);
  }

  const [row] = await db
    .select()
    .from(resource.table.table)
    .where(and(eq(resource.table.id, id), rbacFilter(ctx, permission)))
    .limit(1);

  if (!row) notFound();

  const [, action] = permission.split(".");
  checkGuard(resource, action, row as Record<string, unknown>);
  return row as Record<string, unknown>;
}
