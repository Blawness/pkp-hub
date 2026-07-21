import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";
import { loadEffectivePermissions } from "@/lib/rbac/context";

/**
 * Menguji penggabungan izin dari banyak role. Fixture-nya memakai role dan
 * user ber-suffix acak, jadi file ini tidak menghapus tabel apa pun dan aman
 * berdampingan dengan data seed.
 */

const suffix = randomUUID().slice(0, 8);
const userId = `fixture-ctx-${suffix}`;
const lonerId = `fixture-loner-${suffix}`;
const roleAKey = `fixture-a-${suffix}`;
const roleBKey = `fixture-b-${suffix}`;

beforeAll(async () => {
  const [roleA] = await db
    .insert(roles)
    .values({ key: roleAKey, name: "Fixture A", area: "staff" })
    .returning();
  const [roleB] = await db
    .insert(roles)
    .values({ key: roleBKey, name: "Fixture B", area: "staff" })
    .returning();

  await db.insert(rolePermissions).values([
    { roleId: roleA.id, permission: "project.read", scope: "assigned" },
    { roleId: roleA.id, permission: "payment.read", scope: "own" },
    // Grant hantu: permission yang tidak ada di katalog kode.
    { roleId: roleA.id, permission: "fitur.dihapus", scope: "all" },
    { roleId: roleB.id, permission: "project.read", scope: "all" },
    { roleId: roleB.id, permission: "equipment.borrow", scope: "all" },
  ]);

  await db.insert(users).values([
    { id: userId, name: "Ctx User", email: `${userId}@fixture.test`, role: "surveyor" },
    { id: lonerId, name: "Loner", email: `${lonerId}@fixture.test`, role: "surveyor" },
  ]);

  await db.insert(userRoles).values([
    { userId, roleId: roleA.id },
    { userId, roleId: roleB.id },
  ]);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, lonerId));
  await db.delete(roles).where(eq(roles.key, roleAKey));
  await db.delete(roles).where(eq(roles.key, roleBKey));
});

describe("loadEffectivePermissions", () => {
  it("menggabungkan izin dari seluruh role", async () => {
    const permissions = await loadEffectivePermissions(userId);
    expect(permissions.get("payment.read")).toBe("own");
    expect(permissions.get("equipment.borrow")).toBe("all");
  });

  it("mengambil scope tertinggi saat dua role memberi izin yang sama", async () => {
    const permissions = await loadEffectivePermissions(userId);
    expect(permissions.get("project.read")).toBe("all");
  });

  it("mengabaikan grant yang tidak ada di katalog kode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const permissions = await loadEffectivePermissions(userId);
    expect(permissions.has("fitur.dihapus" as never)).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("user tanpa role sama sekali tidak punya izin apa pun", async () => {
    const permissions = await loadEffectivePermissions(lonerId);
    expect(permissions.size).toBe(0);
  });
});
