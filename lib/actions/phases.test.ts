import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPhaseForUser,
  deletePhaseForUser,
  getProjectProgress,
  reorderPhasesForUser,
  setPhaseStatusForUser,
  updatePhaseForUser,
  updatePhaseNoteForUser,
} from "@/lib/actions/phases-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, projectPhases, projects, users } from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Berjalan terhadap DB dev sungguhan, pola yang sama dengan `payments.test.ts`.
 *
 * Dua kelompok test load-bearing: BATAS AKSES (admin = rencana, surveyor
 * ber-akses = pekerjaan, klien = tidak ada) dan INVARIAN PROGRES & URUTAN.
 */

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let adminCtx: RbacContext;
let surveyorCtx: RbacContext;
let clientUserCtx: RbacContext;
let projectId: string;
let otherProjectId: string;

beforeAll(async () => {
  await db.delete(projectPhases);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Fase Admin", email: "fase-admin@fixture.test", role: "admin" },
    {
      id: surveyorId,
      name: "Fase Surveyor",
      email: "fase-surveyor@fixture.test",
      role: "surveyor",
    },
    { id: clientUserId, name: "Fase Client", email: "fase-client@fixture.test", role: "client" },
  ]);

  admin = { id: adminId, name: "Fase Admin", email: "fase-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Fase Surveyor",
    email: "fase-surveyor@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Fase Client",
    email: "fase-client@fixture.test",
    role: "client",
  };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien A", type: "individual", userId: clientUserId }])
    .returning();

  // Seed + backfill role SETELAH clients dibuat (ctx.clientId dari clients.userId).
  await seedSystemRoles();
  await backfillUserRoles();
  adminCtx = await makeTestContextForUser(admin);
  surveyorCtx = await makeTestContextForUser(surveyor);
  clientUserCtx = await makeTestContextForUser(clientUser);

  const [projectA] = await db
    .insert(projects)
    .values({
      title: "Proyek Klien A",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId, // di-assign KE surveyor — inti test guard
      status: "baru",
      projectValue: 10_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = projectA.id;

  const [projectB] = await db
    .insert(projects)
    .values({
      title: "Proyek Lain",
      clientId: clientA.id,
      surveyType: "kavling",
      status: "baru",
      projectValue: 5_000_000,
      paymentStatus: "belum",
    })
    .returning();
  otherProjectId = projectB.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

beforeEach(async () => {
  await db.delete(projectPhases).where(eq(projectPhases.projectId, projectId));
  await db.delete(projectPhases).where(eq(projectPhases.projectId, otherProjectId));
});

describe("batas akses", () => {
  it("surveyor tidak bisa menambah fase, walau proyeknya di-assign ke dia", async () => {
    await expect(
      createPhaseForUser(surveyorCtx, { projectId, name: "Curang", weight: 1 }),
    ).rejects.toThrow();
  });

  it("surveyor tidak bisa menghapus fase", async () => {
    const phase = await createPhaseForUser(adminCtx, { projectId, name: "F1", weight: 1 });
    await expect(deletePhaseForUser(surveyorCtx, { phaseId: phase.id })).rejects.toThrow();
  });

  it("surveyor tidak bisa menyusun ulang fase", async () => {
    const a = await createPhaseForUser(adminCtx, { projectId, name: "A", weight: 1 });
    const b = await createPhaseForUser(adminCtx, { projectId, name: "B", weight: 1 });
    await expect(
      reorderPhasesForUser(surveyorCtx, { projectId, orderedPhaseIds: [b.id, a.id] }),
    ).rejects.toThrow();
  });

  it("surveyor tidak bisa mengubah bobot lewat updatePhase", async () => {
    const phase = await createPhaseForUser(adminCtx, { projectId, name: "F1", weight: 1 });
    await expect(
      updatePhaseForUser(surveyorCtx, { phaseId: phase.id, name: "F1", weight: 99 }),
    ).rejects.toThrow();
  });

  // Yang BOLEH dilakukan surveyor — pekerjaan lapangan, bukan rencana.
  it("surveyor ber-akses BISA mengubah status fase dan mengisi catatan", async () => {
    const phase = await createPhaseForUser(adminCtx, { projectId, name: "Ukur", weight: 1 });

    const updated = await setPhaseStatusForUser(surveyorCtx, {
      phaseId: phase.id,
      status: "selesai",
    });
    expect(updated.status).toBe("selesai");
    expect(updated.completedAt).not.toBeNull();

    const noted = await updatePhaseNoteForUser(surveyorCtx, {
      phaseId: phase.id,
      description: "Titik 12 tertutup bangunan.",
    });
    expect(noted.description).toBe("Titik 12 tertutup bangunan.");
  });

  it("surveyor TIDAK bisa mengubah status fase di proyek yang bukan miliknya", async () => {
    const phase = await createPhaseForUser(adminCtx, {
      projectId: otherProjectId,
      name: "Bukan punyamu",
      weight: 1,
    });
    await expect(
      setPhaseStatusForUser(surveyorCtx, { phaseId: phase.id, status: "selesai" }),
    ).rejects.toThrow();
  });

  it("klien tidak bisa mengubah status fase", async () => {
    const phase = await createPhaseForUser(adminCtx, { projectId, name: "F1", weight: 1 });
    await expect(
      setPhaseStatusForUser(clientUserCtx, { phaseId: phase.id, status: "selesai" }),
    ).rejects.toThrow();
  });
});

describe("invarian progres & urutan", () => {
  it("progres diturunkan dari bobot fase yang selesai", async () => {
    await createPhaseForUser(adminCtx, { projectId, name: "A", weight: 3 });
    const b = await createPhaseForUser(adminCtx, { projectId, name: "B", weight: 1 });
    const c = await createPhaseForUser(adminCtx, { projectId, name: "C", weight: 1 });

    await setPhaseStatusForUser(adminCtx, { phaseId: b.id, status: "selesai" });
    await setPhaseStatusForUser(adminCtx, { phaseId: c.id, status: "selesai" });

    expect(await getProjectProgress(adminCtx, projectId)).toBe(40); // 2 / 5
  });

  it("proyek tanpa fase -> progres null, bukan 0", async () => {
    expect(await getProjectProgress(adminCtx, otherProjectId)).toBeNull();
  });

  it("memundurkan status dari selesai mengosongkan completedAt", async () => {
    const phase = await createPhaseForUser(adminCtx, { projectId, name: "A", weight: 1 });
    await setPhaseStatusForUser(adminCtx, { phaseId: phase.id, status: "selesai" });
    const back = await setPhaseStatusForUser(adminCtx, { phaseId: phase.id, status: "berjalan" });
    expect(back.completedAt).toBeNull();
  });

  it("fase baru masuk di urutan terakhir", async () => {
    const a = await createPhaseForUser(adminCtx, { projectId, name: "A", weight: 1 });
    const b = await createPhaseForUser(adminCtx, { projectId, name: "B", weight: 1 });
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
  });

  it("susun ulang menulis ulang seluruh urutan, tanpa kembar", async () => {
    const a = await createPhaseForUser(adminCtx, { projectId, name: "A", weight: 1 });
    const b = await createPhaseForUser(adminCtx, { projectId, name: "B", weight: 1 });
    const c = await createPhaseForUser(adminCtx, { projectId, name: "C", weight: 1 });

    const rows = await reorderPhasesForUser(adminCtx, {
      projectId,
      orderedPhaseIds: [c.id, a.id, b.id],
    });

    expect(rows.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });

  it("susun ulang menolak daftar id yang tidak lengkap", async () => {
    const a = await createPhaseForUser(adminCtx, { projectId, name: "A", weight: 1 });
    await createPhaseForUser(adminCtx, { projectId, name: "B", weight: 1 });
    await expect(
      reorderPhasesForUser(adminCtx, { projectId, orderedPhaseIds: [a.id] }),
    ).rejects.toThrow(/lengkap/i);
  });
});
