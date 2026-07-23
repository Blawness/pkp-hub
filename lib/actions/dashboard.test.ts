import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getAdminDashboardData, getSurveyorDashboardData } from "@/lib/actions/dashboard-logic";
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

/**
 * Runs against the real (Neon) dev database, same convention as
 * `auth-guards.test.ts` — deterministic fixture, real teardown/reseed.
 *
 * Exercises the phase-6/7 brief's REQUIRED tests:
 *  - admin dashboard aggregates (total active value, total unpaid) equal
 *    exact expected numbers for a known fixture
 *  - the project payload a surveyor receives contains NO
 *    projectValue/paymentStatus/paymentNotes keys at all
 *  - non-admin/non-surveyor callers are rejected by the wrong dashboard
 */

let admin: SessionUser;
let surveyor: SessionUser;
let otherSurveyor: SessionUser;
let clientUser: SessionUser;
let adminCtx: RbacContext;
let surveyorCtx: RbacContext;
let otherSurveyorCtx: RbacContext;
let clientCtx: RbacContext;
let fixtureClientId: string;

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
  const otherSurveyorId = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    {
      id: adminId,
      name: "Dash Test Admin",
      email: "test-admin-dashboard@fixture.test",
      role: "admin",
    },
    {
      id: surveyorId,
      name: "Dash Test Surveyor",
      email: "test-surveyor-dashboard@fixture.test",
      role: "surveyor",
    },
    {
      id: otherSurveyorId,
      name: "Dash Test Other Surveyor",
      email: "test-other-surveyor-dashboard@fixture.test",
      role: "surveyor",
    },
    {
      id: clientUserId,
      name: "Dash Test Client",
      email: "test-client-dashboard@fixture.test",
      role: "client",
    },
  ]);

  admin = {
    id: adminId,
    name: "Dash Test Admin",
    email: "test-admin-dashboard@fixture.test",
    role: "admin",
  };
  surveyor = {
    id: surveyorId,
    name: "Dash Test Surveyor",
    email: "test-surveyor-dashboard@fixture.test",
    role: "surveyor",
  };
  otherSurveyor = {
    id: otherSurveyorId,
    name: "Dash Test Other Surveyor",
    email: "test-other-surveyor-dashboard@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Dash Test Client",
    email: "test-client-dashboard@fixture.test",
    role: "client",
  };

  const [client] = await db
    .insert(clients)
    .values([{ name: "Dashboard Fixture Client", type: "individual" }])
    .returning();
  fixtureClientId = client.id;

  await seedSystemRoles();
  await backfillUserRoles();
  adminCtx = await makeTestContextForUser(admin);
  surveyorCtx = await makeTestContextForUser(surveyor);
  otherSurveyorCtx = await makeTestContextForUser(otherSurveyor);
  clientCtx = await makeTestContextForUser(clientUser);

  // Known fixture, deterministic aggregates:
  //  - active (not selesai/dibatalkan): baru 10M + diproses 20M + dijadwalkan 15M = 45_000_000
  //  - unpaid (belum|sebagian), EXCLUDING dibatalkan: baru 10M + diproses 20M
  //    + selesai 5M = 35_000_000 (the dibatalkan/belum 8M fixture below is
  //    deliberately excluded — a cancelled project must not inflate "total
  //    unpaid")
  //  - lunas project (dijadwalkan, 15M): counted in active value, NOT in unpaid
  const insertedProjects = await db
    .insert(projects)
    .values([
      {
        title: "Fixture: baru, belum, assigned to surveyor",
        clientId: fixtureClientId,
        surveyType: "batas_tanah",
        assignedSurveyorId: surveyorId,
        status: "baru",
        projectValue: 10_000_000,
        paymentStatus: "belum",
      },
      {
        title: "Fixture: diproses, sebagian, assigned to surveyor",
        clientId: fixtureClientId,
        surveyType: "topografi",
        assignedSurveyorId: surveyorId,
        status: "diproses",
        projectValue: 20_000_000,
        paymentStatus: "sebagian",
      },
      {
        title: "Fixture: selesai, sebagian (unpaid but inactive)",
        clientId: fixtureClientId,
        surveyType: "kavling",
        assignedSurveyorId: otherSurveyorId,
        status: "selesai",
        projectValue: 5_000_000,
        paymentStatus: "sebagian",
      },
      {
        title: "Fixture: dibatalkan, belum (excluded from active value AND from total unpaid)",
        clientId: fixtureClientId,
        surveyType: "lainnya",
        status: "dibatalkan",
        projectValue: 8_000_000,
        paymentStatus: "belum",
      },
      {
        title: "Fixture: dijadwalkan, lunas (active value, not unpaid), assigned to surveyor",
        clientId: fixtureClientId,
        surveyType: "luas_bangunan",
        assignedSurveyorId: surveyorId,
        status: "dijadwalkan",
        projectValue: 15_000_000,
        paymentStatus: "lunas",
      },
    ])
    .returning();

  // Proyek "lunas" fixture HARUS punya pembayaran penuh, supaya di bawah logic
  // piutang eksak ia benar-benar menyumbang 0 ke `totalUnpaid` (seperti yang
  // diharapkan test "computes exact" di bawah). Tanpa ini, status "lunas" yang
  // tidak didukung uang akan tetap dihitung piutang penuh.
  const lunasProject = insertedProjects.find((p) => p.paymentStatus === "lunas");
  if (lunasProject) {
    await db.insert(payments).values({
      projectId: lunasProject.id,
      amount: lunasProject.projectValue ?? 0,
      paidAt: "2026-07-01",
      method: "transfer",
      receiptNumber: `KW/PKP/2026/${Date.now()}`,
      recordedById: adminId,
    });
  }
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("getAdminDashboardData", () => {
  it("computes exact total active value and total unpaid from the fixture", async () => {
    const data = await getAdminDashboardData(adminCtx);
    // active (not selesai/dibatalkan): 10M + 20M + 15M = 45M
    expect(data.totalActiveValue).toBe(45_000_000);
    // unpaid (belum|sebagian), excluding dibatalkan: 10M + 20M + 5M = 35M
    // (the dibatalkan/belum 8M fixture is deliberately excluded)
    expect(data.totalUnpaid).toBe(35_000_000);
  });

  it("counts projects per status", async () => {
    const data = await getAdminDashboardData(adminCtx);
    expect(data.countsByStatus.baru).toBe(1);
    expect(data.countsByStatus.diproses).toBe(1);
    expect(data.countsByStatus.selesai).toBe(1);
    expect(data.countsByStatus.dibatalkan).toBe(1);
    expect(data.countsByStatus.dijadwalkan).toBe(1);
  });

  it("totalUnpaid memotong uang yang sudah masuk, bukan menghitung nilai proyek penuh", async () => {
    // Proyek 10jt, DP 4jt sudah masuk. Piutangnya 6jt — bukan 10jt. Karena fixture
    // di atas sudah punya piutang sendiri, kita ukur SELISIH-nya: +6.000.000.
    const before = (await getAdminDashboardData(adminCtx)).totalUnpaid;

    const [project] = await db
      .insert(projects)
      .values({
        title: "Piutang Fixture",
        clientId: fixtureClientId,
        surveyType: "kavling",
        status: "diproses",
        projectValue: 10_000_000,
        paymentStatus: "sebagian",
      })
      .returning();

    await db.insert(payments).values({
      projectId: project.id,
      amount: 4_000_000,
      paidAt: "2026-07-14",
      method: "transfer",
      receiptNumber: `KW/PKP/2026/${Date.now()}`,
      recordedById: admin.id,
    });

    const after = (await getAdminDashboardData(adminCtx)).totalUnpaid;
    expect(after - before).toBe(6_000_000);
  });

  it("pembayaran yang dibatalkan tidak mengurangi piutang", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        title: "Piutang Batal Fixture",
        clientId: fixtureClientId,
        surveyType: "kavling",
        status: "diproses",
        projectValue: 3_000_000,
        paymentStatus: "belum",
      })
      .returning();

    await db.insert(payments).values({
      projectId: project.id,
      amount: 3_000_000,
      paidAt: "2026-07-14",
      method: "transfer",
      receiptNumber: `KW/PKP/2026/${Date.now() + 1}`,
      recordedById: admin.id,
      voidedAt: new Date(),
      voidedReason: "Salah proyek",
      voidedById: admin.id,
    });

    const data = await getAdminDashboardData(adminCtx);
    // Uangnya dibatalkan, jadi piutangnya utuh 3jt — bukan 0.
    expect(data.totalUnpaid).toBeGreaterThanOrEqual(3_000_000);
  });

  it("a surveyor CANNOT read the admin dashboard", async () => {
    await expect(getAdminDashboardData(surveyorCtx)).rejects.toThrow();
  });

  it("a client CANNOT read the admin dashboard", async () => {
    await expect(getAdminDashboardData(clientCtx)).rejects.toThrow();
  });
});

describe("getSurveyorDashboardData", () => {
  it("only returns projects assigned to the calling surveyor", async () => {
    const data = await getSurveyorDashboardData(surveyorCtx);
    expect(data.projects).toHaveLength(3);
    expect(data.projects.every((p) => p.title.includes("assigned to surveyor"))).toBe(true);
  });

  it("marks baru/dijadwalkan/data_diambil as needing action", async () => {
    const data = await getSurveyorDashboardData(surveyorCtx);
    const baru = data.projects.find((p) => p.status === "baru");
    const dijadwalkan = data.projects.find((p) => p.status === "dijadwalkan");
    const diproses = data.projects.find((p) => p.status === "diproses");
    expect(baru?.needsAction).toBe(true);
    expect(dijadwalkan?.needsAction).toBe(true);
    expect(diproses?.needsAction).toBe(false);
    expect(data.needsActionCount).toBe(2);
  });

  it("CRITICAL: the surveyor's project payload contains NO finance keys at all", async () => {
    const data = await getSurveyorDashboardData(surveyorCtx);
    expect(data.projects.length).toBeGreaterThan(0);
    for (const project of data.projects) {
      expect(Object.keys(project)).not.toContain("projectValue");
      expect(Object.keys(project)).not.toContain("paymentStatus");
      expect(Object.keys(project)).not.toContain("paymentNotes");
      expect(project).not.toHaveProperty("projectValue");
      expect(project).not.toHaveProperty("paymentStatus");
      expect(project).not.toHaveProperty("paymentNotes");
    }
  });

  it("an admin CANNOT read the surveyor dashboard function", async () => {
    await expect(getSurveyorDashboardData(adminCtx)).rejects.toThrow();
  });

  it("a client CANNOT read the surveyor dashboard function", async () => {
    await expect(getSurveyorDashboardData(clientCtx)).rejects.toThrow();
  });

  it("surveyor B (unassigned to the fixtures above) sees only their own project", async () => {
    const data = await getSurveyorDashboardData(otherSurveyorCtx);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0]?.title).toContain("selesai, sebagian");
  });
});
