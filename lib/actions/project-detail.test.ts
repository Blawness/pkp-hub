import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";
import { getProjectDetailForUser } from "./projects-logic";

/**
 * Runs against the real (Neon) dev database, same convention as
 * `finance.test.ts`. This is the REQUIRED regression test for the Phase
 * 6+7 review's CRITICAL finding: the project detail dashboard page
 * (`app/dashboard/projects/[id]/page.tsx`) fetched the full project row
 * (including `projectValue` / `paymentStatus` / `paymentNotes`) regardless
 * of role, relying only on client-side JSX conditionals to keep the
 * Keuangan tab hidden from surveyors — those fields were still present in
 * the page's data and could leak into the RSC/HTML payload.
 *
 * `getProjectDetailForUser` is the fix: it must OMIT the finance keys
 * entirely (not just leave them unused) for any non-admin caller. This test
 * MUST fail if that server-side omission is ever removed.
 */

let admin: SessionUser;
let surveyor: SessionUser;
let projectId: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();

  await db.insert(users).values([
    {
      id: adminId,
      name: "Project Detail Test Admin",
      email: "test-admin-project-detail@fixture.test",
      role: "admin",
    },
    {
      id: surveyorId,
      name: "Project Detail Test Surveyor",
      email: "test-surveyor-project-detail@fixture.test",
      role: "surveyor",
    },
  ]);

  admin = {
    id: adminId,
    name: "Project Detail Test Admin",
    email: "test-admin-project-detail@fixture.test",
    role: "admin",
  };
  surveyor = {
    id: surveyorId,
    name: "Project Detail Test Surveyor",
    email: "test-surveyor-project-detail@fixture.test",
    role: "surveyor",
  };

  const [client] = await db
    .insert(clients)
    .values([{ name: "Project Detail Fixture Client", type: "individual" }])
    .returning();

  const [project] = await db
    .insert(projects)
    .values({
      title: "Project Detail Fixture Project",
      clientId: client.id,
      surveyType: "batas_tanah",
      assignedSurveyorId: surveyorId,
      status: "diproses",
      projectValue: 85_000_000,
      paymentStatus: "sebagian",
      paymentNotes: "DP diterima.",
    })
    .returning();
  projectId = project.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("getProjectDetailForUser", () => {
  it("CRITICAL: a SURVEYOR's project detail payload contains NO finance keys at all", async () => {
    const detail = await getProjectDetailForUser(surveyor, projectId);
    expect(Object.keys(detail)).not.toContain("projectValue");
    expect(Object.keys(detail)).not.toContain("paymentStatus");
    expect(Object.keys(detail)).not.toContain("paymentNotes");
    expect(detail).not.toHaveProperty("projectValue");
    expect(detail).not.toHaveProperty("paymentStatus");
    expect(detail).not.toHaveProperty("paymentNotes");
    // Sanity: JSON-stringifying it (closest thing to what an RSC payload
    // would serialize) must not contain the fixture's known finance values.
    const serialized = JSON.stringify(detail);
    expect(serialized).not.toContain("85000000");
    expect(serialized).not.toContain("sebagian");
    expect(serialized).not.toContain("DP diterima");
  });

  it("an OWNER's project detail payload DOES contain the finance keys, with correct values", async () => {
    const detail = await getProjectDetailForUser(admin, projectId);
    expect(detail).toHaveProperty("projectValue", 85_000_000);
    expect(detail).toHaveProperty("paymentStatus", "sebagian");
    expect(detail).toHaveProperty("paymentNotes", "DP diterima.");
  });

  it("non-finance fields are identical for both roles", async () => {
    const adminDetail = await getProjectDetailForUser(admin, projectId);
    const surveyorDetail = await getProjectDetailForUser(surveyor, projectId);
    expect(surveyorDetail.id).toBe(adminDetail.id);
    expect(surveyorDetail.title).toBe(adminDetail.title);
    expect(surveyorDetail.status).toBe(adminDetail.status);
  });

  it("a surveyor not assigned to the project is rejected (row-level scoping still applies)", async () => {
    const unassignedSurveyor: SessionUser = {
      id: randomUUID(),
      name: "Unassigned Surveyor",
      email: "unassigned@fixture.test",
      role: "surveyor",
    };
    await expect(getProjectDetailForUser(unassignedSurveyor, projectId)).rejects.toThrow();
  });
});
