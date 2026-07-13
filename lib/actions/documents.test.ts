import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  listDocumentsForProject,
  searchDocumentsForUser,
  toggleDocumentShareForUser,
  uploadDocumentForUser,
} from "@/lib/actions/documents-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, mapLayers, projectStatusLogs, projects, users } from "@/lib/db/schema";

/**
 * Runs against the real (Neon) dev database, same convention as
 * `projects.test.ts`. Exercises the Phase 4 brief's REQUIRED tests:
 *  - a surveyor cannot upload a document to a project they're not assigned to
 *  - a surveyor cannot call `toggleDocumentShare` (admin-only)
 *  - cross-project document search is scoped to what the caller may see
 */

let admin: SessionUser;
let surveyorAssigned: SessionUser;
let clientA: { id: string };
let clientB: { id: string };
let projectAssigned: string;
let projectOther: string;

beforeAll(async () => {
  await db.delete(documents);
  await db.delete(mapLayers);
  await db.delete(projectStatusLogs);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorAssignedId = randomUUID();
  const surveyorOtherId = randomUUID();

  await db.insert(users).values([
    {
      id: adminId,
      name: "Doc Test Admin",
      email: "test-admin-documents@fixture.test",
      role: "admin",
    },
    {
      id: surveyorAssignedId,
      name: "Doc Test Surveyor Assigned",
      email: "test-surveyor-assigned-documents@fixture.test",
      role: "surveyor",
    },
    {
      id: surveyorOtherId,
      name: "Doc Test Surveyor Other",
      email: "test-surveyor-other-documents@fixture.test",
      role: "surveyor",
    },
  ]);

  admin = {
    id: adminId,
    name: "Doc Test Admin",
    email: "test-admin-documents@fixture.test",
    role: "admin",
  };
  surveyorAssigned = {
    id: surveyorAssignedId,
    name: "Doc Test Surveyor Assigned",
    email: "test-surveyor-assigned-documents@fixture.test",
    role: "surveyor",
  };
  const [ca, cb] = await db
    .insert(clients)
    .values([
      { name: "Doc Fixture Client A", type: "individual" },
      { name: "Doc Fixture Client B", type: "individual" },
    ])
    .returning();
  clientA = ca;
  clientB = cb;

  const [pAssigned, pOther] = await db
    .insert(projects)
    .values([
      {
        title: "Doc Fixture Project (assigned)",
        clientId: clientA.id,
        surveyType: "batas_tanah",
        assignedSurveyorId: surveyorAssignedId,
        status: "baru",
      },
      {
        title: "Doc Fixture Project (other)",
        clientId: clientB.id,
        surveyType: "topografi",
        assignedSurveyorId: surveyorOtherId,
        status: "baru",
      },
    ])
    .returning();
  projectAssigned = pAssigned.id;
  projectOther = pOther.id;
});

afterAll(() => {
  execSync("pnpm db:seed", { stdio: "inherit" });
});

describe("uploadDocumentForUser", () => {
  it("a surveyor CANNOT upload a document to a project they are not assigned to", async () => {
    await expect(
      uploadDocumentForUser(surveyorAssigned, {
        projectId: projectOther,
        name: "foto.jpg",
        category: "foto_lapangan",
        fileUrl: "/api/storage/documents/x/foto.jpg",
        fileSize: 1024,
        mimeType: "image/jpeg",
      }),
    ).rejects.toThrow();

    const rows = await db.select().from(documents).where(eq(documents.projectId, projectOther));
    expect(rows).toHaveLength(0);
  });

  it("the assigned surveyor CAN upload a document to their own project", async () => {
    const doc = await uploadDocumentForUser(surveyorAssigned, {
      projectId: projectAssigned,
      name: "laporan.pdf",
      category: "laporan",
      fileUrl: "/api/storage/documents/y/laporan.pdf",
      fileSize: 2048,
      mimeType: "application/pdf",
    });
    expect(doc.projectId).toBe(projectAssigned);
    expect(doc.uploadedById).toBe(surveyorAssigned.id);
  });
});

describe("toggleDocumentShareForUser", () => {
  it("a surveyor CANNOT toggle sharedWithClient (admin-only)", async () => {
    const doc = await uploadDocumentForUser(admin, {
      projectId: projectAssigned,
      name: "sertifikat.pdf",
      category: "sertifikat",
      fileUrl: "/api/storage/documents/z/sertifikat.pdf",
      fileSize: 512,
      mimeType: "application/pdf",
    });

    await expect(
      toggleDocumentShareForUser(surveyorAssigned, { id: doc.id, sharedWithClient: true }),
    ).rejects.toThrow();

    const [row] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(row.sharedWithClient).toBe(false);
  });

  it("the admin CAN toggle sharedWithClient", async () => {
    const doc = await uploadDocumentForUser(admin, {
      projectId: projectAssigned,
      name: "data.csv",
      category: "data_mentah",
      fileUrl: "/api/storage/documents/w/data.csv",
      fileSize: 256,
      mimeType: "text/csv",
    });

    const updated = await toggleDocumentShareForUser(admin, { id: doc.id, sharedWithClient: true });
    expect(updated.sharedWithClient).toBe(true);
  });
});

describe("searchDocumentsForUser: cross-project scoping", () => {
  it("a surveyor's search only returns documents from projects assigned to them", async () => {
    // `projectAssigned` already has documents from the tests above;
    // add one to `projectOther`, owned by a different surveyor.
    await uploadDocumentForUser(admin, {
      projectId: projectOther,
      name: "other-project-doc.pdf",
      category: "laporan",
      fileUrl: "/api/storage/documents/v/other-project-doc.pdf",
      fileSize: 128,
      mimeType: "application/pdf",
    });

    const results = await searchDocumentsForUser(surveyorAssigned, {});
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.projectId === projectAssigned)).toBe(true);
    expect(results.some((r) => r.name === "other-project-doc.pdf")).toBe(false);
  });

  it("the admin's search returns documents across all projects", async () => {
    const results = await searchDocumentsForUser(admin, {});
    const projectIds = new Set(results.map((r) => r.projectId));
    expect(projectIds.has(projectAssigned)).toBe(true);
    expect(projectIds.has(projectOther)).toBe(true);
  });

  it("filters by category", async () => {
    const results = await searchDocumentsForUser(admin, { category: "sertifikat" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.category === "sertifikat")).toBe(true);
  });

  it("this test fails if the guard is removed: a surveyor querying a project they don't own via listDocumentsForProject is rejected", async () => {
    await expect(listDocumentsForProject(surveyorAssigned, projectOther)).rejects.toThrow();
  });
});
