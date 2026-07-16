import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { clients, equipment, equipmentUsage, projects, users } from "@/lib/db/schema";

/**
 * Berjalan terhadap DB dev sungguhan, pola yang sama dengan `payments.test.ts`.
 */

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
  await db.delete(equipmentUsage);
  await db.delete(equipment);
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

describe("batas akses", () => {
  it("surveyor tidak bisa menambah alat", async () => {
    await expect(
      createEquipmentForUser(surveyor, {
        name: "Curang",
        category: "drone",
        condition: "tersedia",
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengubah kondisi alat", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    await expect(
      updateEquipmentForUser(surveyor, {
        equipmentId: item.id,
        name: "TS-1",
        category: "instrumen_ukur",
        condition: "rusak",
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengarsipkan alat", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    await expect(archiveEquipmentForUser(surveyor, { equipmentId: item.id })).rejects.toThrow(
      /admin/i,
    );
  });

  // Dikunci pada BENTUK hasil query, bukan pada render — UI bukan batas keamanan.
  //
  // PENYIMPANGAN dari plan: plan menegaskan `rows` panjangnya 1, dengan asumsi
  // ini alat pertama yang dibuat. Tapi test-test sebelumnya di describe yang
  // sama juga sukses membuat alat (mereka menguji bahwa langkah SESUDAHNYA —
  // update/archive — ditolak, bukan bahwa create-nya gagal), jadi pada titik
  // ini sudah ada beberapa baris. Diberi nama unik dan dicari lewat `.find`
  // supaya assertion-nya tetap menegaskan BENTUK baris yang benar tanpa
  // bergantung pada urutan/isolasi test lain.
  it("baris alat yang sampai ke surveyor TIDAK memuat harga & tanggal beli", async () => {
    await createEquipmentForUser(admin, {
      name: "TS-Harga",
      category: "instrumen_ukur",
      condition: "tersedia",
      purchasePrice: 250_000_000,
      purchaseDate: "2025-01-10",
    });

    const rows = await listEquipmentForUser(surveyor);
    const row = rows.find((r) => r.name === "TS-Harga");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("purchasePrice");
    expect(row).not.toHaveProperty("purchaseDate");
    expect(JSON.stringify(rows)).not.toContain("250000000");

    const adminRows = await listEquipmentForUser(admin);
    const adminRow = adminRows.find((r) => r.name === "TS-Harga") as EquipmentRow | undefined;
    expect(adminRow?.purchasePrice).toBe(250_000_000);
  });

  it("surveyor tidak bisa mencatat pemakaian untuk proyek yang bukan miliknya", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    await expect(
      borrowEquipmentForUser(surveyor, {
        equipmentId: item.id,
        projectId: otherProjectId,
        startedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  // Server MEMAKSA usedById = dirinya. Kalau ini cuma tidak dirender di form,
  // request yang dirakit tangan bisa mencatat alat di tangan orang lain.
  it("surveyor yang mengisi usedById orang lain tetap tercatat atas namanya sendiri", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });

    const usage = await borrowEquipmentForUser(surveyor, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
      usedById: admin.id, // dicoba
    });

    expect(usage.usedById).toBe(surveyor.id);
    expect(usage.recordedById).toBe(surveyor.id);
  });

  it("admin BOLEH mencatat atas nama surveyor", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });

    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
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

describe("gambar alat", () => {
  it("menyimpan URL gambar saat create", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-Gambar",
      category: "instrumen_ukur",
      condition: "tersedia",
      image: "/api/storage/equipment/aaa.webp",
    });
    expect(item.image).toBe("/api/storage/equipment/aaa.webp");
  });

  it("mengganti gambar saat update (dan tidak melempar walau objek lama tak ada)", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-GantiGambar",
      category: "instrumen_ukur",
      condition: "tersedia",
      image: "/api/storage/equipment/lama.webp",
    });

    const updated = await updateEquipmentForUser(admin, {
      equipmentId: item.id,
      name: "TS-GantiGambar",
      category: "instrumen_ukur",
      condition: "tersedia",
      image: "/api/storage/equipment/baru.webp",
    });
    expect(updated.image).toBe("/api/storage/equipment/baru.webp");

    const [row] = await db
      .select({ image: equipment.image })
      .from(equipment)
      .where(eq(equipment.id, item.id));
    expect(row.image).toBe("/api/storage/equipment/baru.webp");
  });

  it("menghapus gambar saat image di-set null", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-HapusGambar",
      category: "instrumen_ukur",
      condition: "tersedia",
      image: "/api/storage/equipment/ada.webp",
    });

    const updated = await updateEquipmentForUser(admin, {
      equipmentId: item.id,
      name: "TS-HapusGambar",
      category: "instrumen_ukur",
      condition: "tersedia",
      image: null,
    });
    expect(updated.image).toBeNull();
  });
});

describe("aturan pinjam", () => {
  it("alat rusak tidak bisa dipinjam", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS rusak",
      category: "instrumen_ukur",
      condition: "rusak",
    });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/rusak/i);
  });

  it("alat terarsip tidak bisa dipinjam", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS arsip",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    await archiveEquipmentForUser(admin, { equipmentId: item.id });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/arsip/i);
  });

  it("waktu mulai di masa depan ditolak", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    const besok = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: besok }),
    ).rejects.toThrow(/masa depan/i);
  });

  it("meminjam alat yang sudah dipinjam ditolak, dengan menyebut pemegangnya", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/sedang dipakai/i);
  });

  it("mengembalikan lalu meminjam lagi BOLEH — kuncinya sesi aktif, bukan seumur hidup", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    const first = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: first.id });

    const second = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
    });
    expect(second.id).not.toBe(first.id);
  });

  it("status pakai adalah TURUNAN: alat dengan sesi terbuka tampil sedang dipakai, setelah dikembalikan tidak lagi", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    const dipakai = await getEquipmentForUser(admin, item.id);
    expect(dipakai.activeUsage?.usedById).toBe(surveyor.id);
    expect(dipakai.activeUsage?.projectId).toBe(projectId);

    await returnEquipmentForUser(admin, { usageId: usage.id });

    const bebas = await getEquipmentForUser(admin, item.id);
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
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "instrumen_ukur",
      condition: "tersedia",
    });

    await db.insert(equipmentUsage).values({
      equipmentId: item.id,
      projectId,
      usedById: surveyor.id,
      recordedById: admin.id,
      startedAt: new Date(),
    });

    // PENYIMPANGAN dari plan: `rejects.toThrow(/unique/i)` gagal karena
    // Drizzle (versi terpasang di repo ini) membungkus error pg asli di
    // `error.cause` — pesan top-level cuma "Failed query: insert into ...",
    // tanpa teks constraint. Pertahanannya tetap sepenuhnya di DB (index
    // partial); yang berubah cuma DI MANA pesan aslinya terbaca.
    let caught: unknown;
    try {
      await db.insert(equipmentUsage).values({
        equipmentId: item.id,
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
    const item = await createEquipmentForUser(admin, {
      name: "TS-Koreksi",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
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
    const item = await createEquipmentForUser(admin, {
      name: "TS-Koreksi",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
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
    const item = await createEquipmentForUser(admin, {
      name: "TS-Koreksi",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    const originalStart = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
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
    const item = await createEquipmentForUser(admin, {
      name: "TS-Koreksi",
      category: "instrumen_ukur",
      condition: "tersedia",
    });
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
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
