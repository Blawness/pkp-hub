import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";
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

let adminCtx: RbacContext;
let surveyorCtx: RbacContext;
let unassignedCtx: RbacContext;
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
  const unassignedId = randomUUID();

  const adminUser: SessionUser = {
    id: adminId,
    name: "Project Detail Test Admin",
    email: "test-admin-project-detail@fixture.test",
    role: "admin",
  };
  const surveyorUser: SessionUser = {
    id: surveyorId,
    name: "Project Detail Test Surveyor",
    email: "test-surveyor-project-detail@fixture.test",
    role: "surveyor",
  };
  const unassignedUser: SessionUser = {
    id: unassignedId,
    name: "Unassigned Surveyor",
    email: "test-unassigned-project-detail@fixture.test",
    role: "surveyor",
  };

  await db.insert(users).values([adminUser, surveyorUser, unassignedUser].map((u) => ({ ...u })));

  // Role wajib di-seed & di-backfill: menghapus `users` di atas ikut menghapus
  // penugasan role-nya (FK cascade), jadi `makeTestContextForUser` butuh ini.
  await seedSystemRoles();
  await backfillUserRoles();

  adminCtx = await makeTestContextForUser(adminUser);
  surveyorCtx = await makeTestContextForUser(surveyorUser);
  unassignedCtx = await makeTestContextForUser(unassignedUser);

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
    const detail = await getProjectDetailForUser(surveyorCtx, projectId);
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
    const detail = await getProjectDetailForUser(adminCtx, projectId);
    expect(detail).toHaveProperty("projectValue", 85_000_000);
    expect(detail).toHaveProperty("paymentStatus", "sebagian");
    expect(detail).toHaveProperty("paymentNotes", "DP diterima.");
  });

  it("non-finance fields are identical for both roles", async () => {
    const adminDetail = await getProjectDetailForUser(adminCtx, projectId);
    const surveyorDetail = await getProjectDetailForUser(surveyorCtx, projectId);
    expect(surveyorDetail.id).toBe(adminDetail.id);
    expect(surveyorDetail.title).toBe(adminDetail.title);
    expect(surveyorDetail.status).toBe(adminDetail.status);
  });

  it("a surveyor not assigned to the project is rejected (row-level scoping still applies)", async () => {
    // `unassignedCtx` punya izin surveyor NYATA (project.read:assigned), jadi
    // penolakan datang dari scope BARIS — bukan dari izin kosong.
    await expect(getProjectDetailForUser(unassignedCtx, projectId)).rejects.toThrow();
  });
});
