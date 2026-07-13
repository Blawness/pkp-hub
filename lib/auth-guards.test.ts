import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess, listProjectsForUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database: wipes the app tables, inserts a
 * deterministic fixture, asserts row-level scoping, then restores the
 * canonical dev seed so `pnpm db:seed`'s demo data is left intact for manual
 * testing/dev use after the suite finishes.
 *
 * This is the security-boundary test required by the Phase 2 brief — it
 * must fail if scoping is ever removed from `assertProjectAccess` /
 * `listProjectsForUser`.
 */

let admin: SessionUser;
let surveyorA: SessionUser;
let surveyorB: SessionUser;
let clientUserA: SessionUser;
let clientUserB: SessionUser;

let projA1: string; // client A, assigned to surveyor A
let projA2: string; // client A, assigned to surveyor B
let projB1: string; // client B, assigned to surveyor A
let projB2: string; // client B, unassigned

beforeAll(async () => {
  // FK-safe teardown (mirrors lib/db/seed.ts ordering).
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorAId = randomUUID();
  const surveyorBId = randomUUID();
  const clientUserAId = randomUUID();
  const clientUserBId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Test Admin", email: "test-admin@fixture.test", role: "admin" },
    {
      id: surveyorAId,
      name: "Test Surveyor A",
      email: "test-surveyor-a@fixture.test",
      role: "surveyor",
    },
    {
      id: surveyorBId,
      name: "Test Surveyor B",
      email: "test-surveyor-b@fixture.test",
      role: "surveyor",
    },
    {
      id: clientUserAId,
      name: "Test Client A",
      email: "test-client-a@fixture.test",
      role: "client",
    },
    {
      id: clientUserBId,
      name: "Test Client B",
      email: "test-client-b@fixture.test",
      role: "client",
    },
  ]);

  admin = { id: adminId, name: "Test Admin", email: "test-admin@fixture.test", role: "admin" };
  surveyorA = {
    id: surveyorAId,
    name: "Test Surveyor A",
    email: "test-surveyor-a@fixture.test",
    role: "surveyor",
  };
  surveyorB = {
    id: surveyorBId,
    name: "Test Surveyor B",
    email: "test-surveyor-b@fixture.test",
    role: "surveyor",
  };
  clientUserA = {
    id: clientUserAId,
    name: "Test Client A",
    email: "test-client-a@fixture.test",
    role: "client",
  };
  clientUserB = {
    id: clientUserBId,
    name: "Test Client B",
    email: "test-client-b@fixture.test",
    role: "client",
  };

  const [clientA, clientB] = await db
    .insert(clients)
    .values([
      { name: "Fixture Client A", type: "individual", userId: clientUserAId },
      { name: "Fixture Client B", type: "individual", userId: clientUserBId },
    ])
    .returning();

  const inserted = await db
    .insert(projects)
    .values([
      {
        title: "Project A1",
        clientId: clientA.id,
        surveyType: "batas_tanah",
        assignedSurveyorId: surveyorAId,
      },
      {
        title: "Project A2",
        clientId: clientA.id,
        surveyType: "topografi",
        assignedSurveyorId: surveyorBId,
      },
      {
        title: "Project B1",
        clientId: clientB.id,
        surveyType: "kavling",
        assignedSurveyorId: surveyorAId,
      },
      {
        title: "Project B2",
        clientId: clientB.id,
        surveyType: "luas_bangunan",
        assignedSurveyorId: null,
      },
    ])
    .returning();

  projA1 = inserted[0].id;
  projA2 = inserted[1].id;
  projB1 = inserted[2].id;
  projB2 = inserted[3].id;
});

afterAll(() => {
  // Restore the canonical dev seed so the demo data used for manual/dev
  // testing isn't left in this test's fixture state.
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("assertProjectAccess", () => {
  it("client CANNOT access a project belonging to another client", async () => {
    await expect(assertProjectAccess(projB1, clientUserA)).rejects.toThrow();
  });

  it("client CAN access their own project", async () => {
    const project = await assertProjectAccess(projA1, clientUserA);
    expect(project.id).toBe(projA1);
  });

  it("surveyor CANNOT access a project not assigned to them", async () => {
    await expect(assertProjectAccess(projA1, surveyorB)).rejects.toThrow();
  });

  it("surveyor CAN access an assigned project", async () => {
    const project = await assertProjectAccess(projA1, surveyorA);
    expect(project.id).toBe(projA1);
  });

  it("admin CAN access any project", async () => {
    const project = await assertProjectAccess(projB2, admin);
    expect(project.id).toBe(projB2);
  });

  it("throws for a project that does not exist at all", async () => {
    await expect(assertProjectAccess(randomUUID(), admin)).rejects.toThrow();
  });
});

describe("listProjectsForUser", () => {
  it("admin sees every project", async () => {
    const rows = await listProjectsForUser(admin);
    const ids = rows.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([projA1, projA2, projB1, projB2]));
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it("surveyor sees only projects assigned to them", async () => {
    const rows = await listProjectsForUser(surveyorA);
    const ids = rows.map((p) => p.id).sort();
    expect(ids).toEqual([projA1, projB1].sort());
  });

  it("surveyor B sees only their own assigned project", async () => {
    const rows = await listProjectsForUser(surveyorB);
    const ids = rows.map((p) => p.id);
    expect(ids).toEqual([projA2]);
  });

  it("client sees only their own client's projects", async () => {
    const rowsA = await listProjectsForUser(clientUserA);
    expect(rowsA.map((p) => p.id).sort()).toEqual([projA1, projA2].sort());

    const rowsB = await listProjectsForUser(clientUserB);
    expect(rowsB.map((p) => p.id).sort()).toEqual([projB1, projB2].sort());
  });
});
