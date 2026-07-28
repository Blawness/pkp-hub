import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRole,
  createRole,
  deleteRole,
  listAssignableUsers,
  listExtraRoleAssignments,
  listRoles,
  unassignRole,
  updateRole,
} from "@/lib/actions/roles-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Berjalan di atas DB dev sungguhan. Yang dikunci di sini adalah batas yang
 * membuat role `superuser` punya arti: admin biasa TIDAK boleh menyentuh
 * role/permission, dan role sistem tidak boleh diubah dari UI.
 */

let admin: SessionUser;
let superuser: SessionUser;
let adminCtx: RbacContext;
let superuserCtx: RbacContext;
const createdUserIds: string[] = [];
/** Key role kustom yang dibuat file ini — dibersihkan di `afterAll` supaya
 * run yang gagal di tengah tidak meracuni run berikutnya lewat `uniqueKeyFor`. */
const CUSTOM_ROLE_KEYS = ["editor-dokumen", "sementara", "role-salah"];

async function makeUser(role: "admin" | "surveyor"): Promise<SessionUser> {
  const id = `fixture-roles-${randomUUID().slice(0, 8)}`;
  const email = `${id}@fixture.test`;
  await db.insert(users).values({ id, name: id, email, role });
  createdUserIds.push(id);
  return { id, name: id, email, role };
}

beforeAll(async () => {
  await seedSystemRoles();
  admin = await makeUser("admin");
  superuser = await makeUser("admin");
  await backfillUserRoles();

  const [superuserRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.key, "superuser"));
  await db.insert(userRoles).values({ userId: superuser.id, roleId: superuserRole.id });

  adminCtx = await makeTestContextForUser(admin);
  superuserCtx = await makeTestContextForUser(superuser);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
  await db.delete(roles).where(inArray(roles.key, CUSTOM_ROLE_KEYS));
});

describe("listRoles", () => {
  it("admin ditolak — tidak punya role.read", async () => {
    await expect(listRoles(adminCtx)).rejects.toThrow(/tidak punya izin/i);
  });

  it("superuser melihat semua role sistem beserta grant-nya", async () => {
    const rows = await listRoles(superuserCtx);
    expect(rows.map((r) => r.key)).toEqual(
      expect.arrayContaining(["admin", "surveyor", "client", "superuser"]),
    );
    const superuserRow = rows.find((r) => r.key === "superuser");
    expect(superuserRow?.isSystem).toBe(true);
    expect(superuserRow?.grants.some((g) => g.permission === "role.assign")).toBe(true);
  });
});

describe("createRole / updateRole / deleteRole", () => {
  it("admin ditolak membuat role", async () => {
    await expect(createRole(adminCtx, { name: "Test", area: "staff", grants: [] })).rejects.toThrow(
      /tidak punya izin/i,
    );
  });

  it("superuser membuat role kustom dengan key ter-slug dari nama", async () => {
    const { id } = await createRole(superuserCtx, {
      name: "Editor Dokumen",
      area: "staff",
      grants: [{ permission: "document.read", scope: "all" }],
    });

    const [row] = await db.select().from(roles).where(eq(roles.id, id));
    expect(row.key).toBe("editor-dokumen");
    expect(row.isSystem).toBe(false);

    const rows = await listRoles(superuserCtx);
    const created = rows.find((r) => r.id === id);
    expect(created?.grants).toEqual([{ permission: "document.read", scope: "all" }]);

    await deleteRole(superuserCtx, id);
  });

  it("menolak grant untuk permission yang tidak dikenal katalog", async () => {
    await expect(
      createRole(superuserCtx, {
        name: "Role Salah",
        area: "staff",
        grants: [{ permission: "nonsense.read", scope: "all" }],
      }),
    ).rejects.toThrow(/tidak dikenal katalog/i);
  });

  it("role sistem tidak bisa diubah maupun dihapus", async () => {
    const [adminRole] = await db.select().from(roles).where(eq(roles.key, "admin"));
    await expect(
      updateRole(superuserCtx, { roleId: adminRole.id, name: "Admin", grants: [] }),
    ).rejects.toThrow(/role sistem tidak bisa diubah/i);
    await expect(deleteRole(superuserCtx, adminRole.id)).rejects.toThrow(
      /role sistem tidak bisa dihapus/i,
    );
  });
});

describe("assignRole / unassignRole", () => {
  it("admin ditolak memberi maupun mencabut role", async () => {
    const [superuserRole] = await db.select().from(roles).where(eq(roles.key, "superuser"));
    // Inti dari sub-proyek ini: admin tidak boleh mengangkat dirinya sendiri.
    await expect(assignRole(adminCtx, admin.id, superuserRole.id)).rejects.toThrow(
      /tidak punya izin/i,
    );
    await expect(unassignRole(adminCtx, superuser.id, superuserRole.id)).rejects.toThrow(
      /tidak punya izin/i,
    );
  });

  it("menambah lalu mencabut role tambahan", async () => {
    const { id: roleId } = await createRole(superuserCtx, {
      name: "Sementara",
      area: "staff",
      grants: [],
    });

    await assignRole(superuserCtx, admin.id, roleId);
    let extra = await listExtraRoleAssignments(superuserCtx);
    expect(extra.some((a) => a.userId === admin.id && a.roleId === roleId)).toBe(true);

    await unassignRole(superuserCtx, admin.id, roleId);
    extra = await listExtraRoleAssignments(superuserCtx);
    expect(extra.some((a) => a.userId === admin.id && a.roleId === roleId)).toBe(false);

    await deleteRole(superuserCtx, roleId);
  });

  it("assignment yang mencerminkan role dasar TIDAK muncul di listExtraRoleAssignments", async () => {
    const extra = await listExtraRoleAssignments(superuserCtx);
    // superuser sendiri punya assignment "admin" (role dasar) + "superuser" (ekstra).
    expect(extra.some((a) => a.userId === superuser.id && a.roleKey === "admin")).toBe(false);
    expect(extra.some((a) => a.userId === superuser.id && a.roleKey === "superuser")).toBe(true);
  });

  it("tidak bisa mencabut role dari diri sendiri", async () => {
    const [superuserRole] = await db.select().from(roles).where(eq(roles.key, "superuser"));
    await expect(unassignRole(superuserCtx, superuser.id, superuserRole.id)).rejects.toThrow(
      /tidak bisa mencabut role dari akun Anda sendiri/i,
    );
  });
});

describe("listAssignableUsers", () => {
  it("hanya user aktif, ditolak untuk admin biasa", async () => {
    await expect(listAssignableUsers(adminCtx)).rejects.toThrow(/tidak punya izin/i);
    const rows = await listAssignableUsers(superuserCtx);
    expect(rows.some((u) => u.id === admin.id)).toBe(true);
  });
});
