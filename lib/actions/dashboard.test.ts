import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getAdminDashboardData,
  getOverduePhasesForUser,
  getSurveyorDashboardData,
} from "@/lib/actions/dashboard-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import {
  clients,
  documents,
  mapLayers,
  payments,
  projectPhases,
  projectStatusLogs,
  projects,
  users,
} from "@/lib/db/schema";
import { todayString } from "@/lib/phases/derive";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { fakeContext, makeTestContextForUser } from "@/lib/rbac/test-fixtures";
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

describe("getOverduePhasesForUser (F-2025-07-002)", () => {
  // Fixture khusus: proyek dengan fase yang lewat tempo DAN yang akan jatuh
  // tempo. Kita isolasi dari fixture global di atas dengan menghapus
  // `projectPhases` di awal test ini — fase mereka sudah ada, tapi status
  // semua `selesai`, jadi tidak akan masuk "active" filter.
  beforeAll(async () => {
    await db.delete(projectPhases);
  });

  it("mengembalikan null untuk konteks tanpa phase.read (defensive: role kustom di masa depan)", async () => {
    // Semua role sistem saat ini MEMANG punya `phase.read` (admin:all,
    // surveyor:assigned, client:own). null adalah defensive branch untuk role
    // kustom yang sengaja melepas grant itu — pakai `fakeContext` dengan
    // grants kosong, BUKAN `clientCtx` (yang justru punya phase.read:own).
    const emptyCtx = fakeContext({});
    const data = await getOverduePhasesForUser(emptyCtx);
    expect(data).toBeNull();
  });

  it("klien dengan clientId null menerima data kosong (own scope = himpunan kosong)", async () => {
    // Setelah F-2025-07-009, klien memegang `search.use:own` dan `phase.read:own`.
    // Konteks klien pada test ini `clientId = null` (tidak ditautkan ke baris
    // `clients` mana pun), jadi `rbacFilter(..., 'phase.read')` dengan scope
    // `own` jatuh ke `sql\`false\`` dan query mengembalikan nol baris.
    const data = await getOverduePhasesForUser(clientCtx);
    expect(data).not.toBeNull();
    expect(data).toEqual({
      overdue: [],
      dueSoon: [],
      overdueCount: 0,
      dueSoonCount: 0,
    });
  });

  it("admin melihat overdue + dueSoon, dipisah dengan benar, dengan daysUntilTarget yang akurat", async () => {
    const today = todayString(new Date());
    const yesterday = addDays(today, -1);
    const tomorrow = addDays(today, 1);
    const sixDays = addDays(today, 6);
    const tenDays = addDays(today, 10); // di luar horizon 7 hari — TIDAK masuk

    // Proyek test khusus, assigned ke `surveyor` supaya beberapa cek scoping
    // di bawah bisa valid.
    const [proj] = await db
      .insert(projects)
      .values({
        title: "Overdue Fixture Project",
        clientId: fixtureClientId,
        surveyType: "topografi",
        assignedSurveyorId: surveyor.id,
        status: "diproses",
      })
      .returning();

    // 4 fase: lewat tempo (kemarin), besok (due soon), 6 hari lagi (due soon),
    // 10 hari lagi (di luar horizon).
    await db.insert(projectPhases).values([
      {
        projectId: proj.id,
        name: "Telat Sehari",
        sortOrder: 0,
        status: "berjalan",
        weight: 1,
        assignedSurveyorId: surveyor.id,
        targetDate: yesterday,
      },
      {
        projectId: proj.id,
        name: "Besok",
        sortOrder: 1,
        status: "belum",
        weight: 1,
        assignedSurveyorId: surveyor.id,
        targetDate: tomorrow,
      },
      {
        projectId: proj.id,
        name: "Enam Hari Lagi",
        sortOrder: 2,
        status: "belum",
        weight: 1,
        assignedSurveyorId: surveyor.id,
        targetDate: sixDays,
      },
      {
        projectId: proj.id,
        name: "Sepuluh Hari Lagi",
        sortOrder: 3,
        status: "belum",
        weight: 1,
        assignedSurveyorId: surveyor.id,
        targetDate: tenDays,
      },
      // Selesai dengan target kemarin — HARUS dikecualikan, bukan overdue.
      {
        projectId: proj.id,
        name: "Selesai Meskipun Telat",
        sortOrder: 4,
        status: "selesai",
        weight: 1,
        assignedSurveyorId: surveyor.id,
        targetDate: yesterday,
        completedAt: new Date(),
      },
    ]);

    const data = await getOverduePhasesForUser(adminCtx);
    expect(data).not.toBeNull();
    if (!data) return;

    // Overdue: 1 (Telat Sehari)
    expect(data.overdueCount).toBe(1);
    expect(data.overdue.map((p) => p.phaseName)).toEqual(["Telat Sehari"]);
    expect(data.overdue[0]?.daysUntilTarget).toBeLessThanOrEqual(-1);
    expect(data.overdue[0]?.projectTitle).toBe("Overdue Fixture Project");
    expect(data.overdue[0]?.surveyorName).toBe(surveyor.name);

    // Due soon: 2 (Besok, Enam Hari Lagi)
    expect(data.dueSoonCount).toBe(2);
    const dueSoonNames = data.dueSoon.map((p) => p.phaseName);
    expect(dueSoonNames).toContain("Besok");
    expect(dueSoonNames).toContain("Enam Hari Lagi");
    expect(dueSoonNames).not.toContain("Sepuluh Hari Lagi");
    expect(dueSoonNames).not.toContain("Selesai Meskipun Telat");

    // Due soon diurutkan paling dekat lebih dulu
    for (let i = 1; i < data.dueSoon.length; i++) {
      const prev = data.dueSoon[i - 1];
      const curr = data.dueSoon[i];
      if (prev && curr) {
        expect(prev.daysUntilTarget).toBeLessThanOrEqual(curr.daysUntilTarget);
      }
    }
  });

  it("surveyor hanya melihat fase dari proyek yang ditugaskan padanya", async () => {
    // Buat proyek untuk `otherSurveyor` dengan fase overdue.
    const tomorrow = addDays(todayString(new Date()), 1);
    const [otherProj] = await db
      .insert(projects)
      .values({
        title: "Other Surveyor Project",
        clientId: fixtureClientId,
        surveyType: "kavling",
        assignedSurveyorId: otherSurveyor.id,
        status: "baru",
      })
      .returning();
    await db.insert(projectPhases).values({
      projectId: otherProj.id,
      name: "Other Surveyor Phase",
      sortOrder: 0,
      status: "berjalan",
      weight: 1,
      assignedSurveyorId: otherSurveyor.id,
      targetDate: tomorrow,
    });

    const data = await getOverduePhasesForUser(surveyorCtx);
    expect(data).not.toBeNull();
    if (!data) return;
    // Tidak boleh melihat fase dari proyek otherSurveyor.
    const allNames = [...data.overdue, ...data.dueSoon].map((p) => p.phaseName);
    expect(allNames).not.toContain("Other Surveyor Phase");
  });
});

/** `YYYY-MM-DD` ± N hari, zona Asia/Jakarta. */
function addDays(yyyymmdd: string, days: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d, 0, 0, 0, 0) + days * 86_400_000 - 7 * 3_600_000;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}
