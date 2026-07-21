import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";

/**
 * Membuktikan constraint tabel RBAC benar-benar ada di DB, bukan cuma di
 * schema.ts: unik per (role, permission) dan cascade saat role dihapus.
 * Fixture-nya memakai key/email ber-suffix acak sehingga tidak bentrok dengan
 * data seed dan tidak perlu menghapus tabel milik file test lain.
 */

const suffix = randomUUID().slice(0, 8);
const roleKey = `fixture-role-${suffix}`;
const userId = `fixture-user-${suffix}`;
let roleId: string;

beforeAll(async () => {
  const [role] = await db
    .insert(roles)
    .values({ key: roleKey, name: "Fixture Role", area: "staff" })
    .returning();
  roleId = role.id;

  await db.insert(users).values({
    id: userId,
    name: "Fixture User",
    email: `${userId}@fixture.test`,
    role: "surveyor",
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(roles).where(eq(roles.id, roleId));
});

describe("tabel RBAC", () => {
  it("menyimpan grant sebagai (permission, scope)", async () => {
    await db
      .insert(rolePermissions)
      .values({ roleId, permission: "project.read", scope: "assigned" });

    const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    expect(rows).toHaveLength(1);
    expect(rows[0].permission).toBe("project.read");
    expect(rows[0].scope).toBe("assigned");
  });

  it("menolak permission ganda dalam satu role", async () => {
    await expect(
      db.insert(rolePermissions).values({ roleId, permission: "project.read", scope: "all" }),
    ).rejects.toThrow();
  });

  it("memberi satu user banyak role", async () => {
    const [second] = await db
      .insert(roles)
      .values({ key: `${roleKey}-2`, name: "Fixture Role 2", area: "staff" })
      .returning();

    await db.insert(userRoles).values([
      { userId, roleId },
      { userId, roleId: second.id },
    ]);

    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(rows).toHaveLength(2);

    // Menghapus role ikut menghapus penugasan & grant-nya (cascade).
    await db.delete(roles).where(eq(roles.id, second.id));
    const after = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(after).toHaveLength(1);
  });
});
