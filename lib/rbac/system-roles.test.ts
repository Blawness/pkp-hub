import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";
import { PERMISSIONS } from "@/lib/rbac/resources";
import { backfillUserRoles, SYSTEM_ROLE_GRANTS, seedSystemRoles } from "@/lib/rbac/system-roles";
import type { Scope } from "@/lib/rbac/types";

/**
 * Matrix parity ditulis ULANG di sini, bukan diimpor dari sumbernya —
 * mengimpornya berarti test cuma membandingkan konstanta dengan dirinya
 * sendiri. Kalau seseorang mengubah grant, test menunjuk sel persisnya.
 */
const EXPECTED_SURVEYOR: Record<string, Scope> = {
  "project.read": "assigned",
  "project.changeStatus": "assigned",
  "phase.read": "assigned",
  "phase.setStatus": "assigned",
  "phase.updateNote": "assigned",
  "phase.readInternal": "assigned",
  "map.read": "assigned",
  "map.write": "assigned",
  "document.read": "assigned",
  "document.upload": "assigned",
  "equipment.read": "all",
  "equipment.borrow": "all",
  "equipment.return": "all",
  "search.use": "all",
  "profile.updateOwn": "own",
};

const EXPECTED_CLIENT: Record<string, Scope> = {
  "project.read": "own",
  "project.readFinance": "own",
  "phase.read": "own",
  "map.read": "own",
  "document.read": "own",
  "payment.read": "own",
  // ⌘K portal (F-2025-07-009): klien memakai palette yang SAMA dengan staf;
  // scoping per-kind (`rbacFilter` di `globalSearchForUser`) sudah menyempit
  // ke `own`, jadi di sini `own` hanya untuk konsistensi dengan surveyor
  // (`all`).
  "search.use": "own",
  "profile.updateOwn": "own",
};

const userId = `fixture-backfill-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await seedSystemRoles();
  await db.insert(users).values({
    id: userId,
    name: "Fixture Backfill",
    email: `${userId}@fixture.test`,
    role: "surveyor",
  });
  await backfillUserRoles();
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

async function grantsOf(key: string): Promise<Record<string, Scope>> {
  const rows = await db
    .select({ permission: rolePermissions.permission, scope: rolePermissions.scope })
    .from(roles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(roles.key, key));
  return Object.fromEntries(rows.map((r) => [r.permission, r.scope]));
}

describe("seed system role", () => {
  it("membuat 4 role bawaan ber-flag isSystem", async () => {
    const rows = await db.select().from(roles).where(eq(roles.isSystem, true));
    expect(rows.map((r) => r.key).sort()).toEqual(["admin", "client", "superuser", "surveyor"]);
    expect(rows.find((r) => r.key === "client")?.area).toBe("client");
    expect(rows.find((r) => r.key === "surveyor")?.area).toBe("staff");
    expect(rows.find((r) => r.key === "superuser")?.area).toBe("staff");
  });

  it("superuser punya SETIAP permission di katalog, termasuk role.*", async () => {
    const grants = await grantsOf("superuser");
    expect(Object.keys(grants).sort()).toEqual([...PERMISSIONS].sort());
    expect(grants["role.assign"]).toBe("all");
  });

  it("superuser ber-scope all kecuali profile.updateOwn yang own", async () => {
    const grants = await grantsOf("superuser");
    expect(grants["profile.updateOwn"]).toBe("own");
    for (const [permission, scope] of Object.entries(grants)) {
      if (permission === "profile.updateOwn") continue;
      expect(scope, permission).toBe("all");
    }
  });

  it("admin punya SETIAP permission KECUALI superuser-only prefixes", async () => {
    const grants = await grantsOf("admin");
    const superuserOnly = ["role.", "audit.", "session.", "storage.", "backup."];
    const expected = PERMISSIONS.filter(
      (p) => !superuserOnly.some((prefix) => p.startsWith(prefix)),
    );
    expect(Object.keys(grants).sort()).toEqual([...expected].sort());
  });

  it("admin ber-scope all kecuali profile.updateOwn yang own", async () => {
    const grants = await grantsOf("admin");
    expect(grants["profile.updateOwn"]).toBe("own");
    for (const [permission, scope] of Object.entries(grants)) {
      if (permission === "profile.updateOwn") continue;
      expect(scope, permission).toBe("all");
    }
  });

  it("surveyor persis sesuai matrix", async () => {
    expect(await grantsOf("surveyor")).toEqual(EXPECTED_SURVEYOR);
  });

  it("client persis sesuai matrix", async () => {
    expect(await grantsOf("client")).toEqual(EXPECTED_CLIENT);
  });

  it("hanya memberi grant yang ada di katalog kode", () => {
    for (const grants of Object.values(SYSTEM_ROLE_GRANTS)) {
      for (const permission of Object.keys(grants)) {
        expect(PERMISSIONS, permission).toContain(permission);
      }
    }
  });

  it("idempoten — dijalankan dua kali tidak menggandakan apa pun", async () => {
    const before = await grantsOf("surveyor");
    await seedSystemRoles();
    await backfillUserRoles();
    expect(await grantsOf("surveyor")).toEqual(before);
  });

  it("admin TIDAK dapat permission superuser-only (audit, session, storage, backup)", async () => {
    const grants = await grantsOf("admin");
    const forbidden = [
      "audit.read",
      "session.read",
      "session.revoke",
      "storage.read",
      "storage.cleanup",
      "backup.export",
      "backup.import",
    ];
    for (const perm of forbidden) {
      expect(grants[perm], perm).toBeUndefined();
    }
  });

  it("admin TETAP dapat settings.* dan notification.manage", async () => {
    const grants = await grantsOf("admin");
    expect(grants["settings.read"]).toBe("all");
    expect(grants["settings.update"]).toBe("all");
    expect(grants["notification.manage"]).toBe("all");
  });

  it("superuser dapat semua 11 permission baru", async () => {
    const grants = await grantsOf("superuser");
    const newPerms = [
      "audit.read",
      "session.read",
      "session.revoke",
      "settings.read",
      "settings.update",
      "storage.read",
      "storage.cleanup",
      "notification.manage",
      "backup.export",
      "backup.import",
    ];
    for (const perm of newPerms) {
      expect(grants[perm], perm).toBe("all");
    }
  });
});

describe("backfillUserRoles", () => {
  it("memberi user role sesuai kolom users.role lamanya", async () => {
    const rows = await db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));
    expect(rows.map((r) => r.key)).toEqual(["surveyor"]);
  });
});
