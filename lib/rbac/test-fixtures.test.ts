import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";

const adminId = `fixture-mtc-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await seedSystemRoles();
  await db.insert(users).values({
    id: adminId,
    name: "Fixture MTC",
    email: `${adminId}@fixture.test`,
    role: "admin",
  });
  await backfillUserRoles();
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, adminId));
});

test("memuat permission efektif nyata dari DB untuk user", async () => {
  const ctx = await makeTestContextForUser({
    id: adminId,
    name: "Fixture MTC",
    email: `${adminId}@fixture.test`,
    role: "admin",
  });
  // admin punya seluruh katalog dengan scope `all`.
  expect(ctx.permissions.get("project.read")).toBe("all");
  expect(ctx.clientId).toBeNull();
});
