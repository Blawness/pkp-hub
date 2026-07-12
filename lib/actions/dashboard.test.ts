import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getOwnerDashboardData, getSurveyorDashboardData } from "@/lib/actions/dashboard-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database, same convention as
 * `auth-guards.test.ts` — deterministic fixture, real teardown/reseed.
 *
 * Exercises the phase-6/7 brief's REQUIRED tests:
 *  - owner dashboard aggregates (total active value, total unpaid) equal
 *    exact expected numbers for a known fixture
 *  - the project payload a surveyor receives contains NO
 *    projectValue/paymentStatus/paymentNotes keys at all
 *  - non-owner/non-surveyor callers are rejected by the wrong dashboard
 */

let owner: SessionUser;
let surveyor: SessionUser;
let otherSurveyor: SessionUser;
let clientUser: SessionUser;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const ownerId = randomUUID();
  const surveyorId = randomUUID();
  const otherSurveyorId = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    {
      id: ownerId,
      name: "Dash Test Owner",
      email: "test-owner-dashboard@fixture.test",
      role: "owner",
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

  owner = {
    id: ownerId,
    name: "Dash Test Owner",
    email: "test-owner-dashboard@fixture.test",
    role: "owner",
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

  // Known fixture, deterministic aggregates:
  //  - active (not selesai/dibatalkan): baru 10M + diproses 20M + dijadwalkan 15M = 45_000_000
  //  - unpaid (belum|sebagian), regardless of status: baru 10M + diproses 20M
  //    + selesai 5M + dibatalkan 8M = 43_000_000 (the brief's definition of
  //    "unpaid" is NOT restricted to active projects)
  //  - lunas project (dijadwalkan, 15M): counted in active value, NOT in unpaid
  await db.insert(projects).values([
    {
      title: "Fixture: baru, belum, assigned to surveyor",
      clientId: client.id,
      surveyType: "batas_tanah",
      assignedSurveyorId: surveyorId,
      status: "baru",
      projectValue: 10_000_000,
      paymentStatus: "belum",
    },
    {
      title: "Fixture: diproses, sebagian, assigned to surveyor",
      clientId: client.id,
      surveyType: "topografi",
      assignedSurveyorId: surveyorId,
      status: "diproses",
      projectValue: 20_000_000,
      paymentStatus: "sebagian",
    },
    {
      title: "Fixture: selesai, sebagian (unpaid but inactive)",
      clientId: client.id,
      surveyType: "kavling",
      assignedSurveyorId: otherSurveyorId,
      status: "selesai",
      projectValue: 5_000_000,
      paymentStatus: "sebagian",
    },
    {
      title: "Fixture: dibatalkan, belum (excluded from active value, still counted as unpaid)",
      clientId: client.id,
      surveyType: "lainnya",
      status: "dibatalkan",
      projectValue: 8_000_000,
      paymentStatus: "belum",
    },
    {
      title: "Fixture: dijadwalkan, lunas (active value, not unpaid), assigned to surveyor",
      clientId: client.id,
      surveyType: "luas_bangunan",
      assignedSurveyorId: surveyorId,
      status: "dijadwalkan",
      projectValue: 15_000_000,
      paymentStatus: "lunas",
    },
  ]);
});

afterAll(() => {
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("getOwnerDashboardData", () => {
  it("computes exact total active value and total unpaid from the fixture", async () => {
    const data = await getOwnerDashboardData(owner);
    // active (not selesai/dibatalkan): 10M + 20M + 15M = 45M
    expect(data.totalActiveValue).toBe(45_000_000);
    // unpaid (belum|sebagian), regardless of active/inactive: 10M + 20M + 5M + 8M = 43M
    expect(data.totalUnpaid).toBe(43_000_000);
  });

  it("counts projects per status", async () => {
    const data = await getOwnerDashboardData(owner);
    expect(data.countsByStatus.baru).toBe(1);
    expect(data.countsByStatus.diproses).toBe(1);
    expect(data.countsByStatus.selesai).toBe(1);
    expect(data.countsByStatus.dibatalkan).toBe(1);
    expect(data.countsByStatus.dijadwalkan).toBe(1);
  });

  it("a surveyor CANNOT read the owner dashboard", async () => {
    await expect(getOwnerDashboardData(surveyor)).rejects.toThrow();
  });

  it("a client CANNOT read the owner dashboard", async () => {
    await expect(getOwnerDashboardData(clientUser)).rejects.toThrow();
  });
});

describe("getSurveyorDashboardData", () => {
  it("only returns projects assigned to the calling surveyor", async () => {
    const data = await getSurveyorDashboardData(surveyor);
    expect(data.projects).toHaveLength(3);
    expect(data.projects.every((p) => p.title.includes("assigned to surveyor"))).toBe(true);
  });

  it("marks baru/dijadwalkan/data_diambil as needing action", async () => {
    const data = await getSurveyorDashboardData(surveyor);
    const baru = data.projects.find((p) => p.status === "baru");
    const dijadwalkan = data.projects.find((p) => p.status === "dijadwalkan");
    const diproses = data.projects.find((p) => p.status === "diproses");
    expect(baru?.needsAction).toBe(true);
    expect(dijadwalkan?.needsAction).toBe(true);
    expect(diproses?.needsAction).toBe(false);
    expect(data.needsActionCount).toBe(2);
  });

  it("CRITICAL: the surveyor's project payload contains NO finance keys at all", async () => {
    const data = await getSurveyorDashboardData(surveyor);
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

  it("an owner CANNOT read the surveyor dashboard function", async () => {
    await expect(getSurveyorDashboardData(owner)).rejects.toThrow();
  });

  it("a client CANNOT read the surveyor dashboard function", async () => {
    await expect(getSurveyorDashboardData(clientUser)).rejects.toThrow();
  });

  it("surveyor B (unassigned to the fixtures above) sees only their own project", async () => {
    const data = await getSurveyorDashboardData(otherSurveyor);
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0]?.title).toContain("selesai, sebagian");
  });
});
