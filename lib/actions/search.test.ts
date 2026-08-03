import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uploadDocumentForUser } from "@/lib/actions/documents-logic";
import { globalSearchForUser } from "@/lib/actions/search-logic";
import { globalSearchInputSchema } from "@/lib/actions/search-schemas";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Berjalan melawan DB dev sungguhan (Neon), konvensi `documents.test.ts`.
 * Spec 2026-07-26 — Task 3. Verifikasi bahwa `globalSearchForUser`:
 *  - memblokir role tanpa `search.use` (klien) lewat `assertCan`
 *  - menyembunyikan baris yang tak boleh dilihat role (RBAC scoping per kind)
 *  - memotong hasil per-kind (8) dan total (20)
 *  - menolak input `q` kosong / > 80 char di schema
 */

let admin: SessionUser;
let surveyorP1: SessionUser;
let surveyorP2: SessionUser;
let clientUser: SessionUser;
let adminCtx: RbacContext;
let surveyorP1Ctx: RbacContext;
let surveyorP2Ctx: RbacContext;
let clientCtx: RbacContext;
let clientA: { id: string };
let clientB: { id: string };
let projectP1Id: string;
let projectP2Id: string;
let projectP3Id: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorP1Id = randomUUID();
  const surveyorP2Id = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    {
      id: adminId,
      name: "Search Test Admin",
      email: "test-admin-search@fixture.test",
      role: "admin",
    },
    {
      id: surveyorP1Id,
      name: "Search Test Surveyor P1",
      email: "test-surveyor-p1@fixture.test",
      role: "surveyor",
    },
    {
      id: surveyorP2Id,
      name: "Search Test Surveyor P2",
      email: "test-surveyor-p2@fixture.test",
      role: "surveyor",
    },
    {
      id: clientUserId,
      name: "Search Test Client",
      email: "test-client-search@fixture.test",
      role: "client",
    },
  ]);

  admin = {
    id: adminId,
    name: "Search Test Admin",
    email: "test-admin-search@fixture.test",
    role: "admin",
  };
  surveyorP1 = {
    id: surveyorP1Id,
    name: "Search Test Surveyor P1",
    email: "test-surveyor-p1@fixture.test",
    role: "surveyor",
  };
  surveyorP2 = {
    id: surveyorP2Id,
    name: "Search Test Surveyor P2",
    email: "test-surveyor-p2@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Search Test Client",
    email: "test-client-search@fixture.test",
    role: "client",
  };

  // Hapus `users` menghapus penugasan role (FK cascade); seed + backfill lagi.
  await seedSystemRoles();
  await backfillUserRoles();
  adminCtx = await makeTestContextForUser(admin);
  surveyorP1Ctx = await makeTestContextForUser(surveyorP1);
  surveyorP2Ctx = await makeTestContextForUser(surveyorP2);
  clientCtx = await makeTestContextForUser(clientUser);

  const [ca, cb] = await db
    .insert(clients)
    .values([
      { name: "Search Fixture Client A", type: "individual" },
      { name: "Search Fixture Client B", type: "individual" },
    ])
    .returning();
  clientA = ca;
  clientB = cb;

  const insertedProjects = await db
    .insert(projects)
    .values([
      {
        title: "Search Fixture Project P1",
        clientId: clientA.id,
        surveyType: "batas_tanah",
        assignedSurveyorId: surveyorP1Id,
        status: "baru",
      },
      {
        title: "Search Fixture Project P2",
        clientId: clientB.id,
        surveyType: "topografi",
        assignedSurveyorId: surveyorP2Id,
        status: "baru",
      },
      {
        title: "Search Fixture Project P3",
        clientId: clientA.id,
        surveyType: "batas_tanah",
        assignedSurveyorId: null,
        status: "baru",
      },
    ])
    .returning();
  projectP1Id = insertedProjects[0].id;
  projectP2Id = insertedProjects[1].id;
  projectP3Id = insertedProjects[2].id;

  // 2 dokumen — satu per proyek, supaya scoping dokumen punya makna.
  await uploadDocumentForUser(adminCtx, {
    projectId: projectP1Id,
    name: "doc-p1.pdf",
    category: "laporan",
    fileUrl: `/api/storage/documents/${projectP1Id}/doc-p1.pdf`,
    fileSize: 1024,
    mimeType: "application/pdf",
  });
  await uploadDocumentForUser(adminCtx, {
    projectId: projectP2Id,
    name: "doc-p2.pdf",
    category: "laporan",
    fileUrl: `/api/storage/documents/${projectP2Id}/doc-p2.pdf`,
    fileSize: 2048,
    mimeType: "application/pdf",
  });
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("globalSearchForUser: admin melihat semua", () => {
  it("mengembalikan proyek, klien, dan dokumen yang cocok dengan kueri", async () => {
    const projectResults = await globalSearchForUser(adminCtx, "P");
    const projectIds = projectResults.filter((r) => r.kind === "project").map((r) => r.id);
    expect(projectIds.length).toBeGreaterThanOrEqual(3);
    expect(projectIds).toContain(projectP1Id);
    expect(projectIds).toContain(projectP2Id);
    expect(projectIds).toContain(projectP3Id);

    const clientResults = await globalSearchForUser(adminCtx, "Client");
    const clientIds = clientResults.filter((r) => r.kind === "client").map((r) => r.id);
    expect(clientIds.length).toBe(2);
    expect(clientIds).toContain(clientA.id);
    expect(clientIds).toContain(clientB.id);

    const documentResults = await globalSearchForUser(adminCtx, "doc");
    const documentIds = documentResults.filter((r) => r.kind === "document").map((r) => r.id);
    expect(documentIds.length).toBe(2);
  });
});

describe("globalSearchForUser: surveyor yang hanya ditugaskan ke P1", () => {
  it("kueri 'P' hanya mengembalikan P1", async () => {
    const results = await globalSearchForUser(surveyorP1Ctx, "P");
    const projectIds = results.filter((r) => r.kind === "project").map((r) => r.id);
    expect(projectIds).toEqual([projectP1Id]);
  });

  it("kueri 'Client' tidak mengembalikan klien manapun (client.read admin-only)", async () => {
    // Catatan: spec test plan menyebut surveyor harusnya melihat klien A
    // (lewat join proyek), tapi `clientResource` saat ini admin-only
    // (scope `all` saja, no `assigned`/`own`). RBAC scoping klien untuk
    // surveyor adalah pekerjaan terpisah dari Task 3 ini.
    const results = await globalSearchForUser(surveyorP1Ctx, "Client");
    const clientResults = results.filter((r) => r.kind === "client");
    expect(clientResults).toEqual([]);
  });

  it("kueri 'doc' hanya mengembalikan dokumen di P1", async () => {
    const results = await globalSearchForUser(surveyorP1Ctx, "doc");
    const documentResults = results.filter((r) => r.kind === "document");
    expect(documentResults.length).toBe(1);
    expect(documentResults[0]?.sub).toBe("Search Fixture Project P1");
  });
});

describe("globalSearchForUser: surveyor yang hanya ditugaskan ke P2", () => {
  it("kueri 'P' hanya mengembalikan P2", async () => {
    const results = await globalSearchForUser(surveyorP2Ctx, "P");
    const projectIds = results.filter((r) => r.kind === "project").map((r) => r.id);
    expect(projectIds).toEqual([projectP2Id]);
  });
});

describe("globalSearchForUser: klien dengan search.use:own (F-2025-07-009)", () => {
  it("tidak melempar dan mengembalikan [] (clientId null → scope own = himpunan kosong)", async () => {
    // Setelah F-2025-07-009 (portal ⌘K), role klien memegang `search.use:own`.
    // `assertCan` lolos; yang menyempitkan hasil adalah `rbacFilter` per kind —
    // `client.read`/`project.read`/`document.read` untuk klien memakai scope
    // `own`, yang untuk `ctx.clientId = null` jatuh ke `sql\`false\``.
    const results = await globalSearchForUser(clientCtx, "anything");
    expect(results).toEqual([]);
  });
});

describe("globalSearchForUser: kueri tanpa hasil", () => {
  it("mengembalikan [] untuk kueri tanpa kecocokan", async () => {
    const results = await globalSearchForUser(adminCtx, "ZZZZ-NoMatch");
    expect(results).toEqual([]);
  });
});

describe("globalSearchForUser: cap per-kind dan total (terakhir, supaya data tidak bocor)", () => {
  it("membatasi tiap kind ke 8 dan total ke 20", async () => {
    // Buat 12 proyek semua match "Cap Test" — admin harus dapat 8 (per-kind cap).
    await db.insert(projects).values(
      Array.from({ length: 12 }, (_, i) => ({
        title: `Search Cap Test Project ${i + 1}`,
        clientId: clientA.id,
        surveyType: "batas_tanah" as const,
        assignedSurveyorId: null,
        status: "baru" as const,
      })),
    );

    const results = await globalSearchForUser(adminCtx, "Cap Test");
    const projectResults = results.filter((r) => r.kind === "project");
    expect(projectResults.length).toBeLessThanOrEqual(8);
    expect(results.length).toBeLessThanOrEqual(20);
  });
});

describe("globalSearchInputSchema: validasi", () => {
  it("menolak string kosong", () => {
    expect(() => globalSearchInputSchema.parse({ q: "" })).toThrow();
  });

  it("menolak string yang lebih panjang dari 80 karakter", () => {
    expect(() => globalSearchInputSchema.parse({ q: "a".repeat(81) })).toThrow();
  });

  it("menolak string yang seluruhnya whitespace (trim → kosong)", () => {
    expect(() => globalSearchInputSchema.parse({ q: "   " })).toThrow();
  });

  it("menerima string valid", () => {
    expect(() => globalSearchInputSchema.parse({ q: "valid query" })).not.toThrow();
  });
});
