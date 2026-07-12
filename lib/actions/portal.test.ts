import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listSharedDocumentsForProject } from "@/lib/actions/documents-logic";
import { listPortalProjects } from "@/lib/actions/portal-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database, same convention as
 * `documents.test.ts` / `auth-guards.test.ts`. Exercises the phase-6/7
 * brief's REQUIRED tests for the client portal:
 *  - a client CANNOT read another client's project (assertProjectAccess
 *    rejects), and the portal project list never includes it either
 *  - the portal document query returns ONLY documents with
 *    `sharedWithClient = true` — an internal (unshared) document seeded on
 *    the same project must never appear
 */

let clientUserA: SessionUser;
let clientUserB: SessionUser;
let projectA: string;
let projectB: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const ownerId = randomUUID();
  const clientUserAId = randomUUID();
  const clientUserBId = randomUUID();

  await db.insert(users).values([
    {
      id: ownerId,
      name: "Portal Test Owner",
      email: "test-owner-portal@fixture.test",
      role: "owner",
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
  ]);

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

  const [clientARow, clientBRow] = await db
    .insert(clients)
    .values([
      { name: "Portal Fixture Client A", type: "individual", userId: clientUserAId },
      { name: "Portal Fixture Client B", type: "individual", userId: clientUserBId },
    ])
    .returning();

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
      uploadedById: ownerId,
    },
    {
      projectId: projectA,
      name: "internal-only.pdf",
      category: "data_mentah",
      fileUrl: "/api/storage/documents/portal/internal-only.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
      sharedWithClient: false,
      uploadedById: ownerId,
    },
  ]);
});

afterAll(() => {
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("client cross-tenant access", () => {
  it("client A CANNOT access client B's project via assertProjectAccess", async () => {
    await expect(assertProjectAccess(projectB, clientUserA)).rejects.toThrow();
  });

  it("client A's portal project list contains only their own project", async () => {
    const rows = await listPortalProjects(clientUserA);
    expect(rows.map((p) => p.id)).toEqual([projectA]);
  });

  it("client B's portal project list contains only their own project", async () => {
    const rows = await listPortalProjects(clientUserB);
    expect(rows.map((p) => p.id)).toEqual([projectB]);
  });

  it("a non-client role is rejected by listPortalProjects", async () => {
    const owner: SessionUser = {
      id: randomUUID(),
      name: "x",
      email: "x@fixture.test",
      role: "owner",
    };
    await expect(listPortalProjects(owner)).rejects.toThrow();
  });
});

describe("listSharedDocumentsForProject: shared-only filter", () => {
  it("CRITICAL: returns ONLY the document with sharedWithClient=true; the internal document is absent", async () => {
    const rows = await listSharedDocumentsForProject(clientUserA, projectA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("shared-report.pdf");
    expect(rows.some((r) => r.name === "internal-only.pdf")).toBe(false);
    expect(rows.every((r) => r.sharedWithClient === true)).toBe(true);
  });

  it("client B cannot list client A's project documents at all", async () => {
    await expect(listSharedDocumentsForProject(clientUserB, projectA)).rejects.toThrow();
  });
});
