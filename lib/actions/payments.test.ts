import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getPaymentSummary,
  listPaymentsForProject,
  listReceiptsForAdmin,
  recordPaymentForUser,
  voidPaymentForUser,
} from "@/lib/actions/payments-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import {
  clients,
  documents,
  mapLayers,
  payments,
  projectStatusLogs,
  projects,
  users,
} from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";
import type { ReceiptStorage } from "@/lib/receipts";

/**
 * Berjalan terhadap DB dev sungguhan, pola yang sama dengan `finance.test.ts`.
 *
 * Dua kelompok test di sini, dan keduanya load-bearing:
 *
 * 1. BATAS AKSES. Surveyor tidak boleh menyentuh apa pun dari ledger — bahkan
 *    untuk proyek yang di-assign KE DIA. Ini bukan formalitas: kwitansi memuat
 *    nilai proyek, dan jaminan "surveyor tidak lihat keuangan" (yang sudah
 *    dikunci `dashboard.test.ts`) runtuh kalau ledger bocor. Test-test itu
 *    HARUS jeblok kalau `assertCan` di `payments-logic.ts` dicabut.
 *
 * 2. INVARIAN UANG. Status turunan cocok dengan uang yang masuk; pembatalan
 *    memundurkan status; dan — yang paling gampang salah — PEMBAYARAN TETAP
 *    TERCATAT walau kwitansi gagal dibuat.
 */

// Storage palsu yang selalu berhasil.
const okStore: ReceiptStorage = {
  put: async (key) => `/api/storage/${key}`,
};

// Storage palsu yang SELALU gagal — meniru R2 down.
const brokenStore: ReceiptStorage = {
  put: async () => {
    throw new Error("R2 down");
  },
};

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let otherClientUser: SessionUser;
let adminCtx: RbacContext;
let surveyorCtx: RbacContext;
let clientUserCtx: RbacContext;
let otherClientUserCtx: RbacContext;
let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
  await db.delete(payments);
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();
  const clientUserId = randomUUID();
  const otherClientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Pay Admin", email: "pay-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Pay Surveyor", email: "pay-surveyor@fixture.test", role: "surveyor" },
    { id: clientUserId, name: "Pay Client", email: "pay-client@fixture.test", role: "client" },
    {
      id: otherClientUserId,
      name: "Pay Other",
      email: "pay-other@fixture.test",
      role: "client",
    },
  ]);

  admin = { id: adminId, name: "Pay Admin", email: "pay-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Pay Surveyor",
    email: "pay-surveyor@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Pay Client",
    email: "pay-client@fixture.test",
    role: "client",
  };
  otherClientUser = {
    id: otherClientUserId,
    name: "Pay Other",
    email: "pay-other@fixture.test",
    role: "client",
  };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien A", type: "individual", userId: clientUserId }])
    .returning();
  const [clientB] = await db
    .insert(clients)
    .values([{ name: "Klien B", type: "individual", userId: otherClientUserId }])
    .returning();

  // Seed + backfill role SETELAH clients dibuat (ctx.clientId dari clients.userId).
  await seedSystemRoles();
  await backfillUserRoles();
  adminCtx = await makeTestContextForUser(admin);
  surveyorCtx = await makeTestContextForUser(surveyor);
  clientUserCtx = await makeTestContextForUser(clientUser);
  otherClientUserCtx = await makeTestContextForUser(otherClientUser);

  const [projectA] = await db
    .insert(projects)
    .values({
      title: "Proyek Klien A",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId, // di-assign KE surveyor — inti test guard
      status: "baru",
      projectValue: 10_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = projectA.id;

  const [projectB] = await db
    .insert(projects)
    .values({
      title: "Proyek Klien B",
      clientId: clientB.id,
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

describe("batas akses ledger", () => {
  it("surveyor TIDAK bisa melihat pembayaran proyek yang di-assign ke dia", async () => {
    await expect(listPaymentsForProject(surveyorCtx, projectId)).rejects.toThrow();
  });

  it("surveyor TIDAK bisa mencatat pembayaran", async () => {
    await expect(
      recordPaymentForUser(
        surveyorCtx,
        { projectId, amount: 1_000_000, paidAt: "2026-07-14", method: "transfer" },
        okStore,
      ),
    ).rejects.toThrow();

    const rows = await db.select().from(payments).where(eq(payments.projectId, projectId));
    expect(rows).toHaveLength(0);
  });

  it("klien TIDAK bisa mencatat pembayaran untuk proyeknya sendiri", async () => {
    await expect(
      recordPaymentForUser(
        clientUserCtx,
        { projectId, amount: 1_000_000, paidAt: "2026-07-14", method: "transfer" },
        okStore,
      ),
    ).rejects.toThrow();
  });

  it("klien TIDAK bisa melihat pembayaran proyek klien lain", async () => {
    await expect(listPaymentsForProject(otherClientUserCtx, projectId)).rejects.toThrow();
  });

  it("surveyor TIDAK bisa membuka arsip kwitansi", async () => {
    await expect(listReceiptsForAdmin(surveyorCtx)).rejects.toThrow();
  });

  it("klien TIDAK bisa membuka arsip kwitansi", async () => {
    await expect(listReceiptsForAdmin(clientUserCtx)).rejects.toThrow();
  });
});

describe("arsip kwitansi (admin)", () => {
  it("admin melihat semua kwitansi lintas proyek, bukan baris batal", async () => {
    // Proyek khusus agar tidak mengotori state proyek bersama (projectId/
    // otherProjectId) yang dipakai describe lain di file ini.
    const [clientX] = await db
      .insert(clients)
      .values([{ name: "Klien Arsip", type: "individual" }])
      .returning();
    const [projX] = await db
      .insert(projects)
      .values({
        title: "Proyek Arsip",
        clientId: clientX.id,
        surveyType: "kavling",
        status: "baru",
        projectValue: 50_000_000,
        paymentStatus: "belum",
      })
      .returning();

    // 4jt (kwitansi ke-0001) dan 5jt (kwitansi ke-0002) di proyek ini.
    const p1 = await recordPaymentForUser(
      adminCtx,
      {
        projectId: projX.id,
        amount: 4_000_000,
        paidAt: "2026-07-14",
        method: "transfer",
        note: "DP",
      },
      okStore,
    );
    const p2 = await recordPaymentForUser(
      adminCtx,
      { projectId: projX.id, amount: 5_000_000, paidAt: "2026-07-15", method: "tunai" },
      okStore,
    );

    const receipts = await listReceiptsForAdmin(adminCtx);
    const numbers = receipts.map((r) => r.receiptNumber);
    expect(numbers).toContain(p1.receiptNumber);
    expect(numbers).toContain(p2.receiptNumber);

    // Kwitansi dengan file punya `receiptFileUrl`; baris batal tidak ikut masuk.
    const p2Row = receipts.find((r) => r.receiptNumber === p2.receiptNumber);
    expect(p2Row?.receiptFileUrl).toBeTruthy();
    expect(receipts.every((r) => r.isVoided === false)).toBe(true);

    // Batalkan salah satu → tidak lagi muncul di arsip.
    await voidPaymentForUser(adminCtx, { paymentId: p1.id, reason: "salah" }, okStore);
    const afterVoid = await listReceiptsForAdmin(adminCtx);
    expect(afterVoid.map((r) => r.receiptNumber)).not.toContain(p1.receiptNumber);
    expect(afterVoid.map((r) => r.receiptNumber)).toContain(p2.receiptNumber);
  });
});

describe("recordPaymentForUser", () => {
  it("menolak pembayaran kalau nilai proyek belum diisi", async () => {
    const [noValue] = await db
      .insert(projects)
      .values({
        title: "Tanpa nilai",
        clientId: (await db.select().from(clients).limit(1))[0].id,
        surveyType: "kavling",
        status: "baru",
        projectValue: null,
        paymentStatus: "belum",
      })
      .returning();

    await expect(
      recordPaymentForUser(
        adminCtx,
        { projectId: noValue.id, amount: 1_000, paidAt: "2026-07-14", method: "tunai" },
        okStore,
      ),
    ).rejects.toThrow();
  });

  it("mencatat pembayaran, menerbitkan nomor kwitansi, dan menurunkan status jadi sebagian", async () => {
    const payment = await recordPaymentForUser(
      adminCtx,
      { projectId, amount: 4_000_000, paidAt: "2026-07-14", method: "transfer", note: "DP" },
      okStore,
    );

    expect(payment.amount).toBe(4_000_000);
    expect(payment.receiptNumber).toMatch(/^KW\/PKP\/2026\/\d{4,}$/);
    expect(payment.receiptFileUrl).toContain("receipts/");

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.paymentStatus).toBe("sebagian");

    const summary = await getPaymentSummary(adminCtx, projectId);
    expect(summary.totalPaid).toBe(4_000_000);
    expect(summary.remaining).toBe(6_000_000);
  });

  it("pelunasan membuat status jadi lunas", async () => {
    await recordPaymentForUser(
      adminCtx,
      { projectId, amount: 6_000_000, paidAt: "2026-07-20", method: "transfer" },
      okStore,
    );

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.paymentStatus).toBe("lunas");

    const summary = await getPaymentSummary(adminCtx, projectId);
    expect(summary.totalPaid).toBe(10_000_000);
    expect(summary.remaining).toBe(0);
  });

  it("dua pembayaran beruntun tidak pernah bernomor kwitansi sama", async () => {
    const a = await recordPaymentForUser(
      adminCtx,
      { projectId: otherProjectId, amount: 1_000, paidAt: "2026-07-14", method: "tunai" },
      okStore,
    );
    const b = await recordPaymentForUser(
      adminCtx,
      { projectId: otherProjectId, amount: 1_000, paidAt: "2026-07-14", method: "tunai" },
      okStore,
    );
    expect(a.receiptNumber).not.toBe(b.receiptNumber);
  });

  it("PEMBAYARAN TETAP TERCATAT walau kwitansi gagal dibuat", async () => {
    // Uang yang sudah masuk adalah fakta; PDF cuma cerminannya. Kalau R2 down
    // membuat studio tidak bisa mencatat uang masuk, kita sudah kalah. Test ini
    // HARUS jeblok kalau try/catch di sekitar generateAndStoreReceipt dicabut.
    const payment = await recordPaymentForUser(
      adminCtx,
      { projectId: otherProjectId, amount: 2_000, paidAt: "2026-07-14", method: "tunai" },
      brokenStore,
    );

    expect(payment.receiptFileUrl).toBeNull();
    expect(payment.receiptNumber).toBeTruthy();

    const [row] = await db.select().from(payments).where(eq(payments.id, payment.id));
    expect(row).toBeTruthy();
    expect(row.amount).toBe(2_000);
  });
});

describe("voidPaymentForUser", () => {
  it("pembatalan mengeluarkan baris dari total dan memundurkan status", async () => {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.projectId, projectId))
      .limit(1);

    await voidPaymentForUser(adminCtx, { paymentId: row.id, reason: "Salah nominal" }, okStore);

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    // Sebelumnya lunas (10jt dari dua pembayaran). Satu dibatalkan -> mundur.
    expect(project.paymentStatus).toBe("sebagian");

    const summary = await getPaymentSummary(adminCtx, projectId);
    expect(summary.totalPaid).toBeLessThan(10_000_000);
  });

  it("surveyor TIDAK bisa membatalkan pembayaran", async () => {
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.projectId, projectId))
      .limit(1);

    await expect(
      voidPaymentForUser(surveyorCtx, { paymentId: row.id, reason: "coba-coba" }, okStore),
    ).rejects.toThrow();
  });

  it("klien tidak pernah melihat baris yang dibatalkan", async () => {
    const rows = await listPaymentsForProject(clientUserCtx, projectId);
    expect(rows.every((r) => r.voidedAt === null)).toBe(true);
  });
});
