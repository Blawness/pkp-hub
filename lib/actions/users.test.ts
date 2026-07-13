import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveUser,
  createStaffUser,
  listUsers,
  restoreUser,
  setUserName,
  setUserPassword,
  setUserRole,
} from "@/lib/actions/users-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import {
  accounts,
  clients,
  documents,
  mapLayers,
  projectStatusLogs,
  projects,
  sessions,
  users,
} from "@/lib/db/schema";

/**
 * Berjalan di atas database dev sungguhan, sama seperti `auth-guards.test.ts`,
 * dan mengembalikan seed kanonik setelah selesai.
 *
 * Yang dikunci di sini adalah invarian yang, kalau jebol, TIDAK BISA dipulihkan
 * lewat aplikasi: kehilangan admin terakhir berarti tidak ada seorang pun yang
 * bisa mengangkat admin baru, sementara pendaftaran mandiri dimatikan
 * (`disableSignUp: true`). Satu-satunya jalan pulih adalah menyentuh DB
 * langsung. Karena itu tes ini bukan formalitas.
 */

let adminA: SessionUser;
let adminB: SessionUser;
let surveyor: SessionUser;

async function seedFixture() {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(sessions);
  await db.delete(accounts);
  await db.delete(users);

  const adminAId = randomUUID();
  const adminBId = randomUUID();
  const surveyorId = randomUUID();

  await db.insert(users).values([
    { id: adminAId, name: "Admin A", email: "admin-a@fixture.test", role: "admin" },
    { id: adminBId, name: "Admin B", email: "admin-b@fixture.test", role: "admin" },
    { id: surveyorId, name: "Surveyor", email: "surveyor@fixture.test", role: "surveyor" },
  ]);

  adminA = { id: adminAId, name: "Admin A", email: "admin-a@fixture.test", role: "admin" };
  adminB = { id: adminBId, name: "Admin B", email: "admin-b@fixture.test", role: "admin" };
  surveyor = { id: surveyorId, name: "Surveyor", email: "surveyor@fixture.test", role: "surveyor" };
}

beforeAll(seedFixture);

afterAll(() => {
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("createStaffUser", () => {
  it("membuat password yang BENAR-BENAR bisa dipakai login (hash Better Auth, bukan buatan sendiri)", async () => {
    const { id } = await createStaffUser({
      name: "Staf Baru",
      email: "staf-baru@fixture.test",
      role: "surveyor",
      password: "rahasia-kuat-123",
    });

    const [credential] = await db
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, id), eq(accounts.providerId, "credential")));

    expect(credential?.password).toBeTruthy();
    // Hash-nya harus dimengerti oleh Better Auth sendiri — inilah yang
    // membedakan "password tersimpan" dari "password bisa dipakai masuk".
    await expect(
      verifyPassword({ hash: credential.password as string, password: "rahasia-kuat-123" }),
    ).resolves.toBe(true);
  });

  it("tidak pernah menyimpan password dalam bentuk mentah", async () => {
    const { id } = await createStaffUser({
      name: "Staf Dua",
      email: "staf-dua@fixture.test",
      role: "surveyor",
      password: "password-mentah-xyz",
    });

    const [credential] = await db
      .select({ password: accounts.password })
      .from(accounts)
      .where(eq(accounts.userId, id));

    expect(credential.password).not.toContain("password-mentah-xyz");
  });

  it("menolak email yang sudah dipakai", async () => {
    await expect(
      createStaffUser({
        name: "Kembar",
        email: "admin-a@fixture.test",
        role: "surveyor",
        password: "rahasia-kuat-123",
      }),
    ).rejects.toThrow(/sudah dipakai/i);
  });
});

describe("invarian admin terakhir", () => {
  it("MENOLAK mengarsipkan admin aktif terakhir", async () => {
    // Sisakan satu admin: arsipkan B lebih dulu (sah, karena A masih ada).
    await archiveUser(adminA, adminB.id);

    // Sekarang A adalah admin terakhir. B (terarsip) mencoba mengarsipkan A.
    await expect(archiveUser(adminB, adminA.id)).rejects.toThrow(/admin aktif terakhir/i);

    await restoreUser(adminB.id);
  });

  it("MENOLAK menurunkan admin aktif terakhir jadi surveyor", async () => {
    await archiveUser(adminA, adminB.id);

    await expect(setUserRole(adminB, adminA.id, "surveyor")).rejects.toThrow(
      /admin aktif terakhir/i,
    );

    await restoreUser(adminB.id);
  });

  it("MENGIZINKAN menurunkan seorang admin selama masih ada admin aktif lain", async () => {
    await setUserRole(adminA, adminB.id, "surveyor");

    const rows = await listUsers();
    expect(rows.find((u) => u.id === adminB.id)?.role).toBe("surveyor");

    await setUserRole(adminA, adminB.id, "admin");
  });
});

describe("tidak boleh menyentuh diri sendiri", () => {
  it("admin tidak bisa mengarsipkan akunnya sendiri", async () => {
    await expect(archiveUser(adminA, adminA.id)).rejects.toThrow(/akun Anda sendiri/i);
  });

  it("admin tidak bisa mengubah role akunnya sendiri", async () => {
    await expect(setUserRole(adminA, adminA.id, "surveyor")).rejects.toThrow(/akun Anda sendiri/i);
  });
});

describe("archiveUser", () => {
  it("mencabut akses tanpa menghapus baris user, dan memutus sesi berjalan", async () => {
    await db.insert(sessions).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: surveyor.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await archiveUser(adminA, surveyor.id);

    const rows = await listUsers();
    const target = rows.find((u) => u.id === surveyor.id);

    // Barisnya HARUS masih ada: proyek & dokumen menunjuk ke sini lewat FK,
    // dan riwayat siapa mengerjakan apa tidak boleh ikut hilang.
    expect(target).toBeDefined();
    expect(target?.archivedAt).toBeInstanceOf(Date);

    const live = await db.select().from(sessions).where(eq(sessions.userId, surveyor.id));
    expect(live).toHaveLength(0);

    await restoreUser(surveyor.id);
  });
});

describe("setUserName", () => {
  it("mengganti nama user lain", async () => {
    await setUserName(surveyor.id, "Surveyor Baru");
    const [row] = await db.select().from(users).where(eq(users.id, surveyor.id));
    expect(row.name).toBe("Surveyor Baru");
  });

  it("membolehkan admin mengganti namanya SENDIRI (tidak seperti setUserRole)", async () => {
    await setUserName(adminA.id, "Admin A Baru");
    const [row] = await db.select().from(users).where(eq(users.id, adminA.id));
    expect(row.name).toBe("Admin A Baru");
  });

  it("memangkas spasi di ujung", async () => {
    await setUserName(adminB.id, "  Admin B  ");
    const [row] = await db.select().from(users).where(eq(users.id, adminB.id));
    expect(row.name).toBe("Admin B");
  });

  it("tidak menyentuh role atau email", async () => {
    await setUserName(surveyor.id, "Nama Lain");
    const [row] = await db.select().from(users).where(eq(users.id, surveyor.id));
    expect(row.role).toBe("surveyor");
    expect(row.email).toBe("surveyor@fixture.test");
  });

  it("menolak user yang tidak ada", async () => {
    await expect(setUserName(randomUUID(), "Hantu")).rejects.toThrow("User tidak ditemukan.");
  });
});

describe("setUserPassword", () => {
  it("mengganti hash dan memutus sesi lama", async () => {
    await db.insert(sessions).values({
      id: randomUUID(),
      token: randomUUID(),
      userId: surveyor.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await setUserPassword(surveyor.id, "password-baru-456");

    const [credential] = await db
      .select({ password: accounts.password })
      .from(accounts)
      .where(and(eq(accounts.userId, surveyor.id), eq(accounts.providerId, "credential")));

    await expect(
      verifyPassword({ hash: credential.password as string, password: "password-baru-456" }),
    ).resolves.toBe(true);

    const live = await db.select().from(sessions).where(eq(sessions.userId, surveyor.id));
    expect(live).toHaveLength(0);
  });
});
