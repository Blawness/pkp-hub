import { eq } from "drizzle-orm";
import { cache } from "react";
import { getClientIdForUser, requireUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { rolePermissions, userRoles } from "@/lib/db/schema";
import { type Permission, isPermission } from "./resources";
import { type RbacContext, type Scope, highestScope } from "./types";

/**
 * Izin efektif seorang user = gabungan seluruh role-nya, mengambil scope
 * TERLUAS saat dua role memberi izin yang sama. Tidak ada aturan deny.
 */
export async function loadEffectivePermissions(userId: string): Promise<Map<Permission, Scope>> {
  const rows = await db
    .select({ permission: rolePermissions.permission, scope: rolePermissions.scope })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .where(eq(userRoles.userId, userId));

  const effective = new Map<Permission, Scope>();
  const unknown = new Set<string>();

  for (const row of rows) {
    // Fail-closed: grant yang tidak dikenal katalog diabaikan, bukan
    // diperlakukan sebagai izin. Menghapus fitur dari kode tidak boleh
    // meninggalkan grant hantu yang masih berlaku.
    if (!isPermission(row.permission)) {
      unknown.add(row.permission);
      continue;
    }
    const current = effective.get(row.permission);
    effective.set(row.permission, current ? highestScope(current, row.scope) : row.scope);
  }

  if (unknown.size > 0) {
    console.warn(`[rbac] grant diabaikan (tidak ada di katalog): ${[...unknown].join(", ")}`);
  }

  return effective;
}

/**
 * Konteks RBAC untuk request ini.
 *
 * Dibungkus React `cache()` sehingga hanya satu query walau dipanggil
 * puluhan kali dalam satu render. TIDAK di-cache lintas request dan tidak
 * dititipkan ke cookie sesi: perubahan role harus langsung berefek, sama
 * alasannya dengan `disableCookieCache: true` di `lib/auth-guards.ts`.
 */
export const getRbacContext = cache(async (): Promise<RbacContext> => {
  const user = await requireUser();
  const [permissions, clientId] = await Promise.all([
    loadEffectivePermissions(user.id),
    getClientIdForUser(user.id),
  ]);
  return { user, permissions, clientId };
});
