import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEquipmentItemForUser,
  listEquipmentItemsForUser,
  updateEquipmentItemForUser,
} from "@/lib/actions/equipment-items-logic";
import { borrowEquipmentForUser, createEquipmentForUser } from "@/lib/actions/equipment-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, equipment, equipmentItem, equipmentUsage, projects, users } from "@/lib/db/schema";

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let projectId: string;

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
    { id: adminId, name: "Item Admin", email: "item-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Item Surveyor", email: "item-surveyor@fixture.test", role: "surveyor" },
    { id: clientUserId, name: "Item Client", email: "item-client@fixture.test", role: "client" },
  ]);

  admin = { id: adminId, name: "Item Admin", email: "item-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Item Surveyor",
    email: "item-surveyor@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Item Client",
    email: "item-client@fixture.test",
    role: "client",
  };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien Item", type: "individual", userId: clientUserId }])
    .returning();

  const [project] = await db
    .insert(projects)
    .values({
      title: "Proyek Item",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId,
      status: "baru",
      projectValue: 1_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = project.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("batas akses", () => {
  it("surveyor tidak bisa menambah jenis alat", async () => {
    await expect(
      createEquipmentItemForUser(surveyor, { name: "Curang", category: "drone" }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengubah jenis alat", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Item-1", category: "drone" });
    await expect(
      updateEquipmentItemForUser(surveyor, { itemId: item.id, name: "Item-1", category: "drone" }),
    ).rejects.toThrow(/admin/i);
  });

  it("klien tidak bisa melihat daftar jenis alat", async () => {
    await expect(listEquipmentItemsForUser(clientUser)).rejects.toThrow();
  });
});

describe("gambar jenis alat", () => {
  it("menyimpan URL gambar saat create", async () => {
    const item = await createEquipmentItemForUser(admin, {
      name: "Item-Gambar",
      category: "drone",
      image: "/api/storage/equipment/aaa.webp",
    });
    expect(item.image).toBe("/api/storage/equipment/aaa.webp");
  });

  it("mengganti gambar saat update (dan tidak melempar walau objek lama tak ada)", async () => {
    const item = await createEquipmentItemForUser(admin, {
      name: "Item-GantiGambar",
      category: "drone",
      image: "/api/storage/equipment/lama.webp",
    });

    const updated = await updateEquipmentItemForUser(admin, {
      itemId: item.id,
      name: "Item-GantiGambar",
      category: "drone",
      image: "/api/storage/equipment/baru.webp",
    });
    expect(updated.image).toBe("/api/storage/equipment/baru.webp");
  });

  it("menghapus gambar saat image di-set null", async () => {
    const item = await createEquipmentItemForUser(admin, {
      name: "Item-HapusGambar",
      category: "drone",
      image: "/api/storage/equipment/ada.webp",
    });

    const updated = await updateEquipmentItemForUser(admin, {
      itemId: item.id,
      name: "Item-HapusGambar",
      category: "drone",
      image: null,
    });
    expect(updated.image).toBeNull();
  });
});

describe("listEquipmentItemsForUser", () => {
  it("item tanpa unit tampil dengan summary nol", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Item-Kosong", category: "laptop" });
    const rows = await listEquipmentItemsForUser(admin);
    const row = rows.find((r) => r.item.id === item.id);
    expect(row).toBeDefined();
    expect(row?.summary).toEqual({ total: 0, tersedia: 0, terpinjam: 0, perawatan: 0, rusak: 0 });
  });

  it("mengelompokkan unit per item dan menghitung agregat tersedia/dipinjam dengan benar", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Item-Grup", category: "gps_rtk" });
    const unit1 = await createEquipmentForUser(admin, {
      itemId: item.id,
      code: "GRP-01",
      condition: "tersedia",
    });
    const unit2 = await createEquipmentForUser(admin, {
      itemId: item.id,
      code: "GRP-02",
      condition: "tersedia",
    });
    await createEquipmentForUser(admin, {
      itemId: item.id,
      code: "GRP-03",
      condition: "perawatan",
    });
    await borrowEquipmentForUser(admin, {
      equipmentId: unit1.id,
      projectId,
      startedAt: new Date(),
    });

    const rows = await listEquipmentItemsForUser(admin);
    const row = rows.find((r) => r.item.id === item.id);
    expect(row?.units).toHaveLength(3);
    expect(row?.units.map((u) => u.id)).toContain(unit2.id);
    expect(row?.summary).toEqual({ total: 3, tersedia: 1, terpinjam: 1, perawatan: 1, rusak: 0 });
  });
});
