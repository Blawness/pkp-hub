import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import { isPermission } from "@/lib/rbac/resources";
import type { RbacContext, Scope } from "@/lib/rbac/types";
import { listUsers } from "./users-logic";

/**
 * Business logic manajemen role, diuji langsung di `roles.test.ts`. Izin
 * ditegakkan lewat engine RBAC (`role.*` — hanya dipunyai `superuser` di
 * matrix, lihat `system-roles.ts`); admin biasa ditolak di sini juga, bukan
 * cuma di action wrapper.
 *
 * Role SISTEM (`isSystem = true`) sengaja tidak bisa diubah/dihapus dari
 * sini: grant-nya ditulis ulang seluruhnya oleh `seedSystemRoles()` tiap
 * deploy, jadi perubahan lewat UI akan hilang diam-diam kalau diizinkan.
 */

export type RoleGrant = { permission: string; scope: Scope };

export type RoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  area: "staff" | "client";
  isSystem: boolean;
  grants: RoleGrant[];
};

export type RoleAssignment = {
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleName: string;
  roleKey: string;
};

export type AssignableUser = { id: string; name: string; email: string };

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "role";
}

/** Key unik untuk role baru: slug nama, ditambah angka kalau bentrok. */
async function uniqueKeyFor(name: string): Promise<string> {
  const base = slugify(name);
  let key = base;
  let suffix = 1;
  for (;;) {
    const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key));
    if (!existing) return key;
    suffix += 1;
    key = `${base}-${suffix}`;
  }
}

function assertKnownPermissions(grants: RoleGrant[]): void {
  for (const grant of grants) {
    if (!isPermission(grant.permission)) {
      throw new Error(`Permission "${grant.permission}" tidak dikenal katalog.`);
    }
  }
}

async function getRoleOrThrow(roleId: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) throw new Error("Role tidak ditemukan.");
  return role;
}

/** Semua role (sistem + kustom) beserta grant-nya. */
export async function listRoles(ctx: RbacContext): Promise<RoleSummary[]> {
  assertCan(ctx, "role.read");

  const [roleRows, grantRows] = await Promise.all([
    db.select().from(roles),
    db
      .select({
        roleId: rolePermissions.roleId,
        permission: rolePermissions.permission,
        scope: rolePermissions.scope,
      })
      .from(rolePermissions),
  ]);

  const grantsByRole = new Map<string, RoleGrant[]>();
  for (const row of grantRows) {
    const list = grantsByRole.get(row.roleId) ?? [];
    list.push({ permission: row.permission, scope: row.scope });
    grantsByRole.set(row.roleId, list);
  }

  return roleRows
    .map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      area: role.area,
      isSystem: role.isSystem,
      grants: grantsByRole.get(role.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Buat role kustom baru. Key-nya diturunkan otomatis dari nama. */
export async function createRole(
  ctx: RbacContext,
  input: { name: string; description?: string; area: "staff" | "client"; grants: RoleGrant[] },
): Promise<{ id: string }> {
  assertCan(ctx, "role.create");
  assertKnownPermissions(input.grants);

  const key = await uniqueKeyFor(input.name);
  const roleId = randomUUID();

  await db.insert(roles).values({
    id: roleId,
    key,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    area: input.area,
    isSystem: false,
  });

  if (input.grants.length > 0) {
    await db.insert(rolePermissions).values(
      input.grants.map((grant) => ({
        roleId,
        permission: grant.permission,
        scope: grant.scope,
      })),
    );
  }

  await recordAudit({
    actorId: ctx.user.id,
    action: "create",
    entityType: "role",
    entityId: roleId,
    detail: { name: input.name, key },
  });

  return { id: roleId };
}

/** Ubah nama/deskripsi/grant role kustom. Role sistem ditolak. */
export async function updateRole(
  ctx: RbacContext,
  input: { roleId: string; name: string; description?: string; grants: RoleGrant[] },
): Promise<void> {
  assertCan(ctx, "role.update");
  assertKnownPermissions(input.grants);

  const role = await getRoleOrThrow(input.roleId);
  if (role.isSystem) {
    throw new Error("Role sistem tidak bisa diubah dari sini — grant-nya ditentukan di kode.");
  }

  await db
    .update(roles)
    .set({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(roles.id, input.roleId));

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
  if (input.grants.length > 0) {
    await db.insert(rolePermissions).values(
      input.grants.map((grant) => ({
        roleId: input.roleId,
        permission: grant.permission,
        scope: grant.scope,
      })),
    );
  }

  await recordAudit({
    actorId: ctx.user.id,
    action: "update",
    entityType: "role",
    entityId: input.roleId,
    detail: { name: input.name },
  });
}

/** Hapus role kustom. Role sistem ditolak. */
export async function deleteRole(ctx: RbacContext, roleId: string): Promise<void> {
  assertCan(ctx, "role.delete");
  const role = await getRoleOrThrow(roleId);
  if (role.isSystem) {
    throw new Error("Role sistem tidak bisa dihapus.");
  }

  await recordAudit({
    actorId: ctx.user.id,
    action: "delete",
    entityType: "role",
    entityId: roleId,
    detail: { name: role.name },
  });

  await db.delete(roles).where(eq(roles.id, roleId));
}

/**
 * Assignment role TAMBAHAN saja — baris yang persis mencerminkan
 * `users.role` (mis. setiap admin otomatis punya assignment "admin")
 * disembunyikan, karena sudah terlihat di halaman User. Panel ini soal siapa
 * punya role EKSTRA di atas role dasarnya, misalnya `superuser`.
 */
export async function listExtraRoleAssignments(ctx: RbacContext): Promise<RoleAssignment[]> {
  assertCan(ctx, "role.read");

  const rows = await db
    .select({
      userId: userRoles.userId,
      userName: users.name,
      userEmail: users.email,
      userBaseRole: users.role,
      roleId: roles.id,
      roleName: roles.name,
      roleKey: roles.key,
    })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(roles.id, userRoles.roleId));

  return rows
    .filter((row) => row.roleKey !== row.userBaseRole)
    .map(({ userId, userName, userEmail, roleId, roleName, roleKey }) => ({
      userId,
      userName,
      userEmail,
      roleId,
      roleName,
      roleKey,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName));
}

/** User aktif yang bisa jadi target assignment role tambahan. */
export async function listAssignableUsers(ctx: RbacContext): Promise<AssignableUser[]> {
  assertCan(ctx, "role.read");
  const rows = await listUsers();
  return rows
    .filter((u) => !u.archivedAt)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Beri role tambahan ke seorang user. Idempoten. */
export async function assignRole(ctx: RbacContext, userId: string, roleId: string): Promise<void> {
  assertCan(ctx, "role.assign");
  await getRoleOrThrow(roleId);

  const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User tidak ditemukan.");

  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();

  await recordAudit({
    actorId: ctx.user.id,
    action: "assign",
    entityType: "role",
    entityId: roleId,
    detail: { userId },
  });
}

/**
 * Cabut role tambahan dari seorang user. Tidak boleh dipakai untuk mencabut
 * role dari diri sendiri — pola sama seperti "admin tidak bisa mengubah role
 * sendiri" di `users-logic.ts`: menghindari superuser mengunci dirinya
 * sendiri dari UI yang sedang ia buka.
 */
export async function unassignRole(
  ctx: RbacContext,
  userId: string,
  roleId: string,
): Promise<void> {
  assertCan(ctx, "role.assign");
  if (ctx.user.id === userId) {
    throw new Error(
      "Anda tidak bisa mencabut role dari akun Anda sendiri — minta superuser lain melakukannya.",
    );
  }
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));

  await recordAudit({
    actorId: ctx.user.id,
    action: "unassign",
    entityType: "role",
    entityId: roleId,
    detail: { userId },
  });
}
