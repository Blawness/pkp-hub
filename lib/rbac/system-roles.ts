import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";
import { PERMISSIONS, type Permission } from "./resources";
import type { Scope } from "./types";

export type SystemRoleKey = "admin" | "surveyor" | "client";

/**
 * Tiga role bawaan. `isSystem` true berarti tidak boleh dihapus atau
 * di-rename lewat UI (sub-proyek 4) — `proxy.ts` dan area /portal bergantung
 * pada key-nya.
 */
export const SYSTEM_ROLES: readonly {
  key: SystemRoleKey;
  name: string;
  description: string;
  area: "staff" | "client";
}[] = [
  {
    key: "admin",
    name: "Admin",
    description: "Akses penuh ke seluruh data dan pengaturan.",
    area: "staff",
  },
  {
    key: "surveyor",
    name: "Surveyor",
    description: "Mengerjakan proyek yang ditugaskan padanya.",
    area: "staff",
  },
  {
    key: "client",
    name: "Klien",
    description: "Melihat proyeknya sendiri lewat portal, hanya baca.",
    area: "client",
  },
];

/**
 * Admin memegang SELURUH katalog dengan scope `all` — kecuali
 * `profile.updateOwn`, yang menurut namanya memang hanya menyasar dirinya
 * sendiri. Ditulis sebagai turunan katalog, bukan daftar manual, supaya
 * permission baru tidak pernah lupa diberikan ke admin.
 */
const adminGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  PERMISSIONS.map((permission) => [permission, permission === "profile.updateOwn" ? "own" : "all"]),
);

/**
 * Matrix parity (spec 2026-07-21). Harus menghasilkan perilaku IDENTIK
 * dengan cek role yang tersebar di codebase sekarang — dibuktikan
 * `lib/rbac/parity.test.ts`.
 */
export const SYSTEM_ROLE_GRANTS: Record<SystemRoleKey, Partial<Record<Permission, Scope>>> = {
  admin: adminGrants,

  surveyor: {
    "project.read": "assigned",
    "project.changeStatus": "assigned",
    "phase.read": "assigned",
    "phase.setStatus": "assigned",
    "phase.updateNote": "assigned",
    // Surveyor melihat catatan internal/bobot/penanggung jawab fase; klien tidak.
    "phase.readInternal": "assigned",
    "map.read": "assigned",
    "map.write": "assigned",
    "document.read": "assigned",
    "document.upload": "assigned",
    // Inventaris tidak per-proyek: surveyor melihat dan meminjam SEMUA alat.
    "equipment.read": "all",
    "equipment.borrow": "all",
    "equipment.return": "all",
    "profile.updateOwn": "own",
  },

  client: {
    "project.read": "own",
    // Klien melihat nilai & status bayar proyeknya sendiri (read-only).
    "project.readFinance": "own",
    "phase.read": "own",
    "map.read": "own",
    "document.read": "own",
    "payment.read": "own",
    "profile.updateOwn": "own",
  },
};

/**
 * Membuat/menyegarkan 3 role bawaan beserta grant-nya. Idempoten: aman
 * dijalankan berkali-kali, dan menjalankannya ulang setelah menambah
 * permission baru akan menambahkannya ke admin.
 */
export async function seedSystemRoles(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const [row] = await db
      .insert(roles)
      .values({
        key: role.key,
        name: role.name,
        description: role.description,
        area: role.area,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: role.name, description: role.description, area: role.area, isSystem: true },
      })
      .returning({ id: roles.id });

    // Grant ditulis ulang seluruhnya, bukan di-merge: matrix di kode adalah
    // sumber kebenaran untuk role BAWAAN, jadi grant yang sudah dihapus dari
    // matrix harus benar-benar hilang dari DB.
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, row.id));

    const grants = Object.entries(SYSTEM_ROLE_GRANTS[role.key]);
    if (grants.length > 0) {
      await db.insert(rolePermissions).values(
        grants.map(([permission, scope]) => ({
          roleId: row.id,
          permission,
          scope: scope as Scope,
        })),
      );
    }
  }
}

/**
 * Mengisi `user_role_assignment` dari kolom `users.role` yang lama — satu
 * baris per user. Idempoten lewat `onConflictDoNothing`, dan sengaja TIDAK
 * menghapus penugasan lain: user yang sudah diberi role tambahan tidak boleh
 * kehilangannya hanya karena seed dijalankan ulang.
 */
export async function backfillUserRoles(): Promise<void> {
  const roleRows = await db
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(inArray(roles.key, ["admin", "surveyor", "client"]));
  const idByKey = new Map(roleRows.map((r) => [r.key, r.id]));

  const userRows = await db.select({ id: users.id, role: users.role }).from(users);
  const values = userRows
    .map((u) => ({ userId: u.id, roleId: idByKey.get(u.role) }))
    .filter((v): v is { userId: string; roleId: string } => Boolean(v.roleId));

  if (values.length === 0) return;
  await db.insert(userRoles).values(values).onConflictDoNothing();
}
