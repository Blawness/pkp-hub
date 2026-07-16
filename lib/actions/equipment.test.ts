import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEquipmentItemForUser } from "@/lib/actions/equipment-items-logic";
import type { EquipmentRow } from "@/lib/actions/equipment-logic";
import {
  archiveEquipmentForUser,
  borrowEquipmentForUser,
  correctUsageForUser,
  createEquipmentForUser,
  getEquipmentForUser,
  listEquipmentForUser,
  returnEquipmentForUser,
  updateEquipmentForUser,
} from "@/lib/actions/equipment-logic";
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

/**
 * Berjalan terhadap DB dev sungguhan, pola yang sama dengan `payments.test.ts`.
 */

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let projectId: string;
let otherProjectId: string;
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
  const clientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Eq Admin", email: "eq-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Eq Surveyor", email: "eq-surveyor@fixture.test", role: "surveyor" },
    { id: clientUserId, name: "Eq Client", email: "eq-client@fixture.test", role: "client" },
  ]);

  admin = { id: adminId, name: "Eq Admin", email: "eq-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Eq Surveyor",
    email: "eq-surveyor@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Eq Client",
    email: "eq-client@fixture.test",
    role: "client",
  };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien A", type: "individual", userId: clientUserId }])
    .returning();

  const [projectA] = await db
    .insert(projects)
    .values({
      title: "Proyek Klien A",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId,
      status: "baru",
      projectValue: 10_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = projectA.id;

  const [projectB] = await db
    .insert(projects)
    .values({
      title: "Proyek Lain",
      clientId: clientA.id,
      surveyType: "kavling",
      status: "baru",
      projectValue: 5_000_000,
      paymentStatus: "belum",
    })
    .returning();
  otherProjectId = projectB.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

/**
 * Tiap unit butuh item induknya sendiri dulu (spec 2026-07-16) — helper ini
 * membuat SATU item baru dengan SATU unit di bawahnya, kode selalu unik lewat
 * counter modul, supaya test tidak perlu memikirkan tabrakan kode secara manual.
 */
async function createTestUnit(
  overrides: Partial<{
    itemName: string;
    condition: "tersedia" | "perawatan" | "rusak" | "pensiun";
    purchasePrice: number;
    purchaseDate: string;
  }> = {},
) {
  unitSeq += 1;
  const item = await createEquipmentItemForUser(admin, {
    name: overrides.itemName ?? `TS-${unitSeq}`,
    category: "instrumen_ukur",
  });
  return createEquipmentForUser(admin, {
    itemId: item.id,
    code: `UNIT-${unitSeq}`,
    condition: overrides.condition ?? "tersedia",
    purchasePrice: overrides.purchasePrice,
    purchaseDate: overrides.purchaseDate,
  });
}

describe("batas akses", () => {
  it("surveyor tidak bisa menambah alat", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Curang", category: "drone" });
    await expect(
      createEquipmentForUser(surveyor, {
        itemId: item.id,
        code: "CURANG-01",
        condition: "tersedia",
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengubah kondisi alat", async () => {
    const unit = await createTestUnit();
    await expect(
      updateEquipmentForUser(surveyor, {
        equipmentId: unit.id,
        code: unit.code,
        condition: "rusak",
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengarsipkan alat", async () => {
    const unit = await createTestUnit();
    await expect(archiveEquipmentForUser(surveyor, { equipmentId: unit.id })).rejects.toThrow(
      /admin/i,
    );
  });

  // Dikunci pada BENTUK hasil query, bukan pada render — UI bukan batas keamanan.
  it("baris alat yang sampai ke surveyor TIDAK memuat harga & tanggal beli", async () => {
    await createTestUnit({
      itemName: "TS-Harga",
      purchasePrice: 250_000_000,
      purchaseDate: "2025-01-10",
    });

    const rows = await listEquipmentForUser(surveyor);
    const row = rows.find((r) => r.itemName === "TS-Harga");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("purchasePrice");
    expect(row).not.toHaveProperty("purchaseDate");
    expect(JSON.stringify(rows)).not.toContain("250000000");

    const adminRows = await listEquipmentForUser(admin);
    const adminRow = adminRows.find((r) => r.itemName === "TS-Harga") as EquipmentRow | undefined;
    expect(adminRow?.purchasePrice).toBe(250_000_000);
  });

  it("surveyor tidak bisa mencatat pemakaian untuk proyek yang bukan miliknya", async () => {
    const unit = await createTestUnit();
    await expect(
      borrowEquipmentForUser(surveyor, {
        equipmentId: unit.id,
        projectId: otherProjectId,
        startedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  // Server MEMAKSA usedById = dirinya. Kalau ini cuma tidak dirender di form,
  // request yang dirakit tangan bisa mencatat alat di tangan orang lain.
  it("surveyor yang mengisi usedById orang lain tetap tercatat atas namanya sendiri", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(surveyor, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
      usedById: admin.id, // dicoba
    });

    expect(usage.usedById).toBe(surveyor.id);
    expect(usage.recordedById).toBe(surveyor.id);
  });

  it("admin BOLEH mencatat atas nama surveyor", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    expect(usage.usedById).toBe(surveyor.id);
    expect(usage.recordedById).toBe(admin.id);
  });

  it("klien tidak bisa melihat daftar alat", async () => {
    await expect(listEquipmentForUser(clientUser)).rejects.toThrow();
  });
});

describe("kode unit unik", () => {
  it("kode unit yang sudah dipakai unit lain ditolak", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Dup", category: "drone" });
    await createEquipmentForUser(admin, { itemId: item.id, code: "DUP-01", condition: "tersedia" });
    await expect(
      createEquipmentForUser(admin, { itemId: item.id, code: "DUP-01", condition: "tersedia" }),
    ).rejects.toThrow(/kode/i);
  });
});

describe("aturan pinjam", () => {
  it("alat rusak tidak bisa dipinjam", async () => {
    const unit = await createTestUnit({ condition: "rusak" });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/rusak/i);
  });

  it("alat terarsip tidak bisa dipinjam", async () => {
    const unit = await createTestUnit();
    await archiveEquipmentForUser(admin, { equipmentId: unit.id });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/arsip/i);
  });

  it("waktu mulai di masa depan ditolak", async () => {
    const unit = await createTestUnit();
    const besok = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: besok }),
    ).rejects.toThrow(/masa depan/i);
  });

  it("meminjam alat yang sudah dipinjam ditolak, dengan menyebut pemegangnya", async () => {
    const unit = await createTestUnit();
    await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/sedang dipakai/i);
  });

  it("mengembalikan lalu meminjam lagi BOLEH — kuncinya sesi aktif, bukan seumur hidup", async () => {
    const unit = await createTestUnit();
    const first = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: first.id });

    const second = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
    });
    expect(second.id).not.toBe(first.id);
  });

  it("status pakai adalah TURUNAN: alat dengan sesi terbuka tampil sedang dipakai, setelah dikembalikan tidak lagi", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    const dipakai = await getEquipmentForUser(admin, unit.id);
    expect(dipakai.activeUsage?.usedById).toBe(surveyor.id);
    expect(dipakai.activeUsage?.projectId).toBe(projectId);

    await returnEquipmentForUser(admin, { usageId: usage.id });

    const bebas = await getEquipmentForUser(admin, unit.id);
    expect(bebas.activeUsage).toBeNull();
  });
});

/**
 * INI test yang membuktikan pertahanannya ada di DATABASE, bukan cuma di kode.
 * Ia sengaja MELEWATI logic layer dan menulis langsung ke tabel. Kalau partial
 * unique index-nya dicabut dari skema, test ini berhenti jeblok — dan itulah
 * gunanya.
 */
describe("kunci sesi ganda di level database", () => {
  it("dua sesi terbuka untuk alat yang sama ditolak constraint, walau logic layer dilewati", async () => {
    const unit = await createTestUnit();

    await db.insert(equipmentUsage).values({
      equipmentId: unit.id,
      projectId,
      usedById: surveyor.id,
      recordedById: admin.id,
      startedAt: new Date(),
    });

    let caught: unknown;
    try {
      await db.insert(equipmentUsage).values({
        equipmentId: unit.id,
        projectId,
        usedById: admin.id,
        recordedById: admin.id,
        startedAt: new Date(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const cause = (caught as { cause?: unknown }).cause;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    expect(causeMessage).toMatch(/equipment_active_usage_uniq|unique/i);
  });
});

describe("koreksi sesi (admin-only)", () => {
  it("surveyor tidak bisa mengoreksi sesi", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: usage.id });

    await expect(
      correctUsageForUser(surveyor, {
        usageId: usage.id,
        startedAt: new Date(Date.now() - 30 * 60 * 1000),
        endedAt: new Date(),
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("klien tidak bisa mengoreksi sesi", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: usage.id });

    await expect(
      correctUsageForUser(clientUser, {
        usageId: usage.id,
        startedAt: new Date(Date.now() - 30 * 60 * 1000),
        endedAt: new Date(),
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("admin bisa mengoreksi startedAt/endedAt sesi yang sudah ditutup, dan nilainya berubah di DB", async () => {
    const unit = await createTestUnit();
    const originalStart = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: originalStart,
    });
    const originalEnd = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await returnEquipmentForUser(admin, { usageId: usage.id, endedAt: originalEnd });

    const correctedStart = new Date(Date.now() - 90 * 60 * 1000);
    const correctedEnd = new Date(Date.now() - 30 * 60 * 1000);
    const corrected = await correctUsageForUser(admin, {
      usageId: usage.id,
      startedAt: correctedStart,
      endedAt: correctedEnd,
    });

    expect(corrected.startedAt.getTime()).toBe(correctedStart.getTime());
    expect(corrected.endedAt?.getTime()).toBe(correctedEnd.getTime());

    const [rowInDb] = await db.select().from(equipmentUsage).where(eq(equipmentUsage.id, usage.id));
    expect(rowInDb.startedAt.getTime()).toBe(correctedStart.getTime());
    expect(rowInDb.endedAt?.getTime()).toBe(correctedEnd.getTime());
  });

  it("koreksi dengan endedAt <= startedAt ditolak", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: usage.id });

    const sameTime = new Date(Date.now() - 30 * 60 * 1000);
    await expect(
      correctUsageForUser(admin, {
        usageId: usage.id,
        startedAt: sameTime,
        endedAt: sameTime,
      }),
    ).rejects.toThrow(/selesai/i);
  });
});
