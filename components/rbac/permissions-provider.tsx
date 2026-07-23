"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Permission } from "@/lib/rbac/resources";

/**
 * Jembatan server → client untuk izin efektif. Layout server memuat
 * `getRbacContext()` lalu menyeberangkan HANYA daftar permission (tanpa
 * scope, tanpa data) ke provider ini.
 *
 * Semua gating di sisi klien bersifat KOSMETIK — menyembunyikan pintu yang
 * terkunci, bukan menguncinya. Penegak sebenarnya tetap server: action lewat
 * `rbacActionClient`, baris lewat `rbacFilter`/`requireScopedRow`.
 */
const PermissionsContext = createContext<ReadonlySet<string>>(new Set());

export function PermissionsProvider({
  permissions,
  children,
}: {
  permissions: Permission[];
  children: ReactNode;
}) {
  const set = useMemo(() => new Set<string>(permissions), [permissions]);
  return <PermissionsContext.Provider value={set}>{children}</PermissionsContext.Provider>;
}

/** `can(permission)` versi klien — murni keanggotaan set, tanpa scope. */
export function usePermissions(): { can: (permission: Permission) => boolean } {
  const set = useContext(PermissionsContext);
  return useMemo(() => ({ can: (permission: Permission) => set.has(permission) }), [set]);
}

/** Render anak hanya kalau izin dimiliki. Kosmetik; server tetap menegakkan. */
export function Can({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = usePermissions();
  if (!can(permission)) return null;
  return <>{children}</>;
}
