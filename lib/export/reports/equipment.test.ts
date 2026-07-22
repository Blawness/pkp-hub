import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEquipmentItemForUser } from "@/lib/actions/equipment-items-logic";
import { createEquipmentForUser, listEquipmentForUser } from "@/lib/actions/equipment-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import {
  clients,
  equipment,
  equipmentItem,
  equipmentUsage,
  projects,
  users,
} from "@/lib/db/schema";
import { equipmentReport } from "@/lib/export/reports/equipment";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Berjalan terhadap DB dev sungguhan, pola yang sama dengan
 * `lib/actions/equipment.test.ts`. Fokusnya bukan "apakah query jalan" (itu
 * urusan test equipment-logic) melainkan dua hal yang khusus laporan: kolom
 * harga TIDAK pernah muncul untuk surveyor, dan filter yang dikirim lewat
 * query string menghasilkan `filterLabel`/`footnote` yang sesuai.
 */

let admin: SessionUser;
let surveyor: SessionUser;
let adminCtx: RbacContext;
let surveyorCtx: RbacContext;
let projectId: string;
let unitSeq = 0;

beforeAll(async () => {
  await db.delete(equipmentUsage);
  await db.delete(equipment);
  await db.delete(equipmentItem);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();
  await db.insert(users).values([
    { id: adminId, name: "Exp Admin", email: "exp-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Exp Surveyor", email: "exp-surveyor@fixture.test", role: "surveyor" },
  ]);
  admin = { id: adminId, name: "Exp Admin", email: "exp-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Exp Surveyor",
    email: "exp-surveyor@fixture.test",
    role: "surveyor",
  };

  await seedSystemRoles();
  await backfillUserRoles();
  adminCtx = await makeTestContextForUser(admin);
  surveyorCtx = await makeTestContextForUser(surveyor);

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien Exp", type: "individual", userId: null }])
    .returning();
  const [projectA] = await db
    .insert(projects)
    .values({
      title: "Proyek Exp",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId,
      status: "baru",
      projectValue: 10_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = projectA.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

type EquipmentCategory = Parameters<typeof createEquipmentItemForUser>[1]["category"];
type EquipmentCondition = NonNullable<Parameters<typeof createEquipmentForUser>[1]["condition"]>;

async function makeUnit(
  overrides: Partial<{
    name: string;
    category: EquipmentCategory;
    condition: EquipmentCondition;
    price: number;
  }> = {},
) {
  unitSeq += 1;
  const item = await createEquipmentItemForUser(adminCtx, {
    name: overrides.name ?? `EXP-${unitSeq}`,
    category: overrides.category ?? "gps_rtk",
  });
  return createEquipmentForUser(adminCtx, {
    itemId: item.id,
    code: `EXP-${unitSeq}`,
    condition: overrides.condition ?? "tersedia",
    purchasePrice: overrides.price,
  });
}

describe("equipment report columns", () => {
  it("admin mendapat kolom Harga beli; surveyor TIDAK", () => {
    const adminCols = equipmentReport.columns(adminCtx).map((c) => c.header);
    const surveyorCols = equipmentReport.columns(surveyorCtx).map((c) => c.header);
    expect(adminCols).toContain("Harga beli");
    expect(surveyorCols).not.toContain("Harga beli");
  });

  it("baris surveyor tidak membawa nilai harga sama sekali", async () => {
    await makeUnit({ name: "Mahal", category: "gps_rtk", price: 300_000_000 });

    const { rows } = await equipmentReport.fetch(surveyorCtx, new URLSearchParams());
    expect(rows.length).toBeGreaterThan(0);
    // Dipangkas di level query (`listEquipmentForUser`), bukan disembunyikan di
    // render: field-nya benar-benar tidak ada di objeknya.
    expect(rows.every((r) => !("purchasePrice" in r))).toBe(true);

    // Dan tidak ada kolom yang bisa membocorkannya lewat pintu belakang.
    expect(equipmentReport.columns(surveyorCtx).some((c) => c.header === "Harga beli")).toBe(false);
  });
});

describe("equipment report fetch + filter", () => {
  it("filterLabel & footnote sesuai filter kategori", async () => {
    await makeUnit({ name: "Drone A", category: "drone", condition: "tersedia" });
    const params = new URLSearchParams("category=drone");
    const { rows, filterLabel, footnote } = await equipmentReport.fetch(adminCtx, params);
    expect(filterLabel).toBe("Kategori: Drone");
    expect(rows.every((r) => r.category === "drone")).toBe(true);
    expect(footnote).toMatch(/^Total: \d+ unit — /);
  });

  it("filter status=terpinjam hanya mengembalikan unit dipakai", async () => {
    const unit = await makeUnit({ name: "Pinjam", category: "drone", condition: "tersedia" });
    await db.insert(equipmentUsage).values({
      equipmentId: unit.id,
      projectId,
      usedById: surveyor.id,
      recordedById: admin.id,
      startedAt: new Date(),
    });

    const { rows, filterLabel } = await equipmentReport.fetch(
      adminCtx,
      new URLSearchParams("status=terpinjam"),
    );
    expect(filterLabel).toBe("Status: Terpinjam");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Boolean(r.activeUsage))).toBe(true);

    // Bersihkan sesi agar tidak mengganggu test lain / reset-seed.
    await db.delete(equipmentUsage);
  });

  it("tanpa filter → filterLabel null, semua baris ikut", async () => {
    const { rows, filterLabel } = await equipmentReport.fetch(adminCtx, new URLSearchParams());
    expect(filterLabel).toBeNull();
    const all = await listEquipmentForUser(adminCtx);
    expect(rows.length).toBe(all.length);
  });
});
