import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listSharedDocumentsForProject } from "@/lib/actions/documents-logic";
import { listPortalPhases, listPortalProjects } from "@/lib/actions/portal-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import {
  clients,
  documents,
  mapLayers,
  projectPhases,
  projectStatusLogs,
  projects,
  users,
} from "@/lib/db/schema";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Runs against the real (Neon) dev database, same convention as
 * `documents.test.ts` / `auth-guards.test.ts`. Exercises the phase-6/7
 * brief's REQUIRED tests for the client portal:
 *  - a client CANNOT read another client's project (requireScopedRow
 *    rejects), and the portal project list never includes it either
 *  - the portal document query returns ONLY documents with
 *    `sharedWithClient = true` — an internal (unshared) document seeded on
 *    the same project must never appear
 */

let admin: SessionUser;
let clientUserA: SessionUser;
let clientUserB: SessionUser;
let surveyor: SessionUser;
let adminCtx: RbacContext;
let clientUserACtx: RbacContext;
let clientUserBCtx: RbacContext;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  await db.delete(projectPhases);
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const clientUserAId = randomUUID();
  const clientUserBId = randomUUID();
  const surveyorId = randomUUID();

  await db.insert(users).values([
    {
      id: adminId,
      name: "Portal Test Admin",
      email: "test-admin-portal@fixture.test",
      role: "admin",
    },
    {
      id: clientUserAId,
      name: "Portal Test Client A",
      email: "test-client-a-portal@fixture.test",
      role: "client",
    },
    {
      id: clientUserBId,
      name: "Portal Test Client B",
      email: "test-client-b-portal@fixture.test",
      role: "client",
    },
    {
      id: surveyorId,
      name: "Portal Test Surveyor",
      email: "test-surveyor-portal@fixture.test",
      role: "surveyor",
    },
  ]);

  admin = {
    id: adminId,
    name: "Portal Test Admin",
    email: "test-admin-portal@fixture.test",
    role: "admin",
  };
  clientUserA = {
    id: clientUserAId,
    name: "Portal Test Client A",
    email: "test-client-a-portal@fixture.test",
    role: "client",
  };
  clientUserB = {
    id: clientUserBId,
    name: "Portal Test Client B",
    email: "test-client-b-portal@fixture.test",
    role: "client",
  };
  surveyor = {
    id: surveyorId,
    name: "Portal Test Surveyor",
    email: "test-surveyor-portal@fixture.test",
    role: "surveyor",
  };

  const [clientARow, clientBRow] = await db
    .insert(clients)
    .values([
      { name: "Portal Fixture Client A", type: "individual", userId: clientUserAId },
      { name: "Portal Fixture Client B", type: "individual", userId: clientUserBId },
    ])
    .returning();

  // Seed + backfill role SETELAH clients dibuat: `ctx.clientId` (scope `own`)
  // diturunkan dari `clients.userId`, jadi baris client harus sudah ada.
  await seedSystemRoles();
  await backfillUserRoles();
  adminCtx = await makeTestContextForUser(admin);
  clientUserACtx = await makeTestContextForUser(clientUserA);
  clientUserBCtx = await makeTestContextForUser(clientUserB);

  const [pA, pB] = await db
    .insert(projects)
    .values([
      { title: "Portal Fixture Project A", clientId: clientARow.id, surveyType: "batas_tanah" },
      { title: "Portal Fixture Project B", clientId: clientBRow.id, surveyType: "topografi" },
    ])
    .returning();
  projectA = pA.id;
  projectB = pB.id;

  await db.insert(documents).values([
    {
      projectId: projectA,
      name: "shared-report.pdf",
      category: "laporan",
      fileUrl: "/api/storage/documents/portal/shared-report.pdf",
      fileSize: 1024,
      mimeType: "application/pdf",
      sharedWithClient: true,
      uploadedById: adminId,
    },
    {
      projectId: projectA,
      name: "internal-only.pdf",
      category: "data_mentah",
      fileUrl: "/api/storage/documents/portal/internal-only.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      sharedWithClient: false,
      uploadedById: adminId,
    },
  ]);
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("client cross-tenant access", () => {
  it("client A CANNOT access client B's project via requireScopedRow", async () => {
    await expect(requireScopedRow(clientUserACtx, "project.read", projectB)).rejects.toThrow();
  });

  it("client A's portal project list contains only their own project", async () => {
    const rows = await listPortalProjects(clientUserACtx);
    expect(rows.map((p) => p.id)).toEqual([projectA]);
  });

  it("client B's portal project list contains only their own project", async () => {
    const rows = await listPortalProjects(clientUserBCtx);
    expect(rows.map((p) => p.id)).toEqual([projectB]);
  });

  it("a non-client role is rejected by listPortalProjects", async () => {
    // Admin memegang `project.read:all` — bukan `own` — jadi tampilan portal
    // menolaknya, sama seperti cek role lama.
    await expect(listPortalProjects(adminCtx)).rejects.toThrow();
  });
});

describe("listSharedDocumentsForProject: shared-only filter", () => {
  it("CRITICAL: returns ONLY the document with sharedWithClient=true; the internal document is absent", async () => {
    const rows = await listSharedDocumentsForProject(clientUserACtx, projectA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("shared-report.pdf");
    expect(rows.some((r) => r.name === "internal-only.pdf")).toBe(false);
    expect(rows.every((r) => r.sharedWithClient === true)).toBe(true);
  });

  it("client B cannot list client A's project documents at all", async () => {
    await expect(listSharedDocumentsForProject(clientUserBCtx, projectA)).rejects.toThrow();
  });
});

describe("listPortalPhases: pemangkasan field internal", () => {
  it("baris fase yang sampai ke klien TIDAK memuat catatan internal, bobot, maupun penanggung jawab", async () => {
    await db.insert(projectPhases).values({
      projectId: projectA,
      name: "Olah data",
      sortOrder: 0,
      weight: 5,
      description: "RAHASIA INTERNAL",
      assignedSurveyorId: surveyor.id,
    });

    const rows = await listPortalPhases(clientUserACtx, projectA);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Olah data");
    // Dikunci pada BENTUK hasil query, bukan pada render — UI bukan batas keamanan.
    expect(rows[0]).not.toHaveProperty("description");
    expect(rows[0]).not.toHaveProperty("weight");
    expect(rows[0]).not.toHaveProperty("assignedSurveyorId");
    expect(JSON.stringify(rows)).not.toContain("RAHASIA INTERNAL");
  });

  it("klien tidak bisa membaca fase proyek klien lain", async () => {
    await expect(listPortalPhases(clientUserBCtx, projectA)).rejects.toThrow();
  });
});
