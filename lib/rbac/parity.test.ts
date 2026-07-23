import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import {
  clients,
  documents,
  mapLayers,
  projectPhases,
  projectStatusLogs,
  projects,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/lib/db/schema";
import { loadEffectivePermissions } from "@/lib/rbac/context";
import { rbacFilter } from "@/lib/rbac/filter";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * SNAPSHOT SCOPE per role — pengganti bukti parity sub-proyek 1.
 *
 * Dulu file ini membandingkan `rbacFilter`/`requireScopedRow` dengan
 * `listProjectsForUser`/`assertProjectAccess` lama sebagai oracle. Helper
 * lama sudah dihapus (pass terakhir migrasi call site), jadi ekspektasinya
 * kini snapshot id-set eksplisit dari fixture deterministik — himpunan yang
 * SAMA dengan yang dihasilkan oracle dulu. Kalau file ini gagal, aturan
 * scope berubah perilaku.
 *
 * Mengikuti pola lama: menghapus tabel app, memasang fixture deterministik,
 * lalu memulihkan seed dev kanonik di akhir.
 */

let admin: SessionUser;
let surveyorA: SessionUser;
let clientUserA: SessionUser;

let adminCtx: RbacContext;
let surveyorCtx: RbacContext;
let clientCtx: RbacContext;

let projA1: string; // client A, ditugaskan ke surveyor A
let projA2: string; // client A, ditugaskan ke surveyor B
let projB1: string; // client B, ditugaskan ke surveyor A
let projB2: string; // client B, tanpa penugasan
let projA3: string; // client A, akses surveyor A HANYA lewat fase

let sharedDocId: string; // dokumen projA1, dibagikan ke klien
let privateDocId: string; // dokumen projA1, TIDAK dibagikan

async function contextFor(user: SessionUser, clientId: string | null): Promise<RbacContext> {
  return { user, permissions: await loadEffectivePermissions(user.id), clientId };
}

beforeAll(async () => {
  // Urutan FK-safe, sama dengan lib/db/seed.ts.
  await db.delete(userRoles);
  await db.delete(rolePermissions);
  await db.delete(roles);
  await db.delete(projectPhases);
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

  await db.insert(users).values([
    { id: adminId, name: "Parity Admin", email: "parity-admin@fixture.test", role: "admin" },
    { id: surveyorAId, name: "Parity Sv A", email: "parity-sv-a@fixture.test", role: "surveyor" },
    { id: surveyorBId, name: "Parity Sv B", email: "parity-sv-b@fixture.test", role: "surveyor" },
    { id: clientUserAId, name: "Parity Cl A", email: "parity-cl-a@fixture.test", role: "client" },
  ]);

  admin = { id: adminId, name: "Parity Admin", email: "parity-admin@fixture.test", role: "admin" };
  surveyorA = {
    id: surveyorAId,
    name: "Parity Sv A",
    email: "parity-sv-a@fixture.test",
    role: "surveyor",
  };
  clientUserA = {
    id: clientUserAId,
    name: "Parity Cl A",
    email: "parity-cl-a@fixture.test",
    role: "client",
  };

  const [clientA, clientB] = await db
    .insert(clients)
    .values([
      { name: "Parity Client A", type: "individual", userId: clientUserAId },
      { name: "Parity Client B", type: "individual", userId: null },
    ])
    .returning();

  const inserted = await db
    .insert(projects)
    .values([
      {
        title: "P A1",
        clientId: clientA.id,
        surveyType: "batas_tanah",
        assignedSurveyorId: surveyorAId,
      },
      {
        title: "P A2",
        clientId: clientA.id,
        surveyType: "topografi",
        assignedSurveyorId: surveyorBId,
      },
      {
        title: "P B1",
        clientId: clientB.id,
        surveyType: "kavling",
        assignedSurveyorId: surveyorAId,
      },
      {
        title: "P B2",
        clientId: clientB.id,
        surveyType: "luas_bangunan",
        assignedSurveyorId: null,
      },
      {
        title: "P A3",
        clientId: clientA.id,
        surveyType: "topografi",
        assignedSurveyorId: surveyorBId,
      },
    ])
    .returning();

  [projA1, projA2, projB1, projB2, projA3] = inserted.map((p) => p.id);

  // Akses lewat fase saja — kasus yang paling gampang terlewat saat migrasi.
  await db.insert(projectPhases).values({
    projectId: projA3,
    name: "Pengukuran",
    sortOrder: 1,
    assignedSurveyorId: surveyorA.id,
  });

  const docs = await db
    .insert(documents)
    .values([
      {
        projectId: projA1,
        name: "Dibagikan.pdf",
        category: "laporan",
        fileUrl: "parity/shared.pdf",
        fileSize: 1,
        mimeType: "application/pdf",
        sharedWithClient: true,
        uploadedById: adminId,
      },
      {
        projectId: projA1,
        name: "Internal.pdf",
        category: "laporan",
        fileUrl: "parity/private.pdf",
        fileSize: 1,
        mimeType: "application/pdf",
        sharedWithClient: false,
        uploadedById: adminId,
      },
    ])
    .returning();
  [sharedDocId, privateDocId] = docs.map((d) => d.id);

  await seedSystemRoles();
  await backfillUserRoles();

  adminCtx = await contextFor(admin, null);
  surveyorCtx = await contextFor(surveyorA, null);
  clientCtx = await contextFor(clientUserA, clientA.id);
});

afterAll(() => {
  // Pulihkan seed dev kanonik supaya data demo tidak ditinggal dalam kondisi
  // fixture — sama dengan lib/auth-guards.test.ts.
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

async function scopedProjectIds(ctx: RbacContext): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(rbacFilter(ctx, "project.read"));
  return rows.map((r) => r.id).sort();
}

describe("snapshot scope proyek per role", () => {
  it("admin melihat SEMUA proyek", async () => {
    expect(await scopedProjectIds(adminCtx)).toEqual(
      [projA1, projA2, projB1, projB2, projA3].sort(),
    );
  });

  it("surveyor melihat penugasan langsung + lewat fase, tidak lebih", async () => {
    // projA1 & projB1 langsung; projA3 hanya lewat fase — kasus yang paling
    // gampang terlewat. projA2/projB2 bukan miliknya.
    expect(await scopedProjectIds(surveyorCtx)).toEqual([projA1, projB1, projA3].sort());
  });

  it("client hanya melihat proyek klien-nya sendiri", async () => {
    expect(await scopedProjectIds(clientCtx)).toEqual([projA1, projA2, projA3].sort());
  });

  it("user tanpa role sama sekali tidak melihat apa pun", async () => {
    const kosong: RbacContext = { user: surveyorA, permissions: new Map(), clientId: null };
    expect(await scopedProjectIds(kosong)).toEqual([]);
  });
});

describe("requireScopedRow menegakkan aturan yang sama dengan daftar", () => {
  it("admin bisa membuka proyek mana pun", async () => {
    await expect(requireScopedRow(adminCtx, "project.read", projB2)).resolves.toBeTruthy();
  });

  it("surveyor ditolak pada proyek yang bukan miliknya", async () => {
    await expect(requireScopedRow(surveyorCtx, "project.read", projA2)).rejects.toThrow();
  });

  it("surveyor diterima lewat penugasan fase", async () => {
    await expect(requireScopedRow(surveyorCtx, "project.read", projA3)).resolves.toBeTruthy();
  });

  it("client ditolak pada proyek klien lain", async () => {
    await expect(requireScopedRow(clientCtx, "project.read", projB1)).rejects.toThrow();
  });

  it("proyek yang tidak ada ditolak sama seperti proyek orang lain", async () => {
    await expect(requireScopedRow(adminCtx, "project.read", randomUUID())).rejects.toThrow();
  });
});

describe("scope dokumen menghormati sharedWithClient", () => {
  async function docIds(ctx: RbacContext): Promise<string[]> {
    const rows = await db
      .select({ id: documents.id })
      .from(documents)
      .where(rbacFilter(ctx, "document.read"));
    return rows.map((r) => r.id).sort();
  }

  it("client hanya melihat dokumen yang dibagikan", async () => {
    const ids = await docIds(clientCtx);
    expect(ids).toContain(sharedDocId);
    expect(ids).not.toContain(privateDocId);
  });

  it("surveyor yang ditugaskan melihat kedua dokumen", async () => {
    const ids = await docIds(surveyorCtx);
    expect(ids).toEqual([sharedDocId, privateDocId].sort());
  });

  it("admin melihat kedua dokumen", async () => {
    const ids = await docIds(adminCtx);
    expect(ids).toEqual([sharedDocId, privateDocId].sort());
  });

  it("dokumen internal tidak bisa dibuka client lewat id langsung", async () => {
    await expect(requireScopedRow(clientCtx, "document.read", privateDocId)).rejects.toThrow();
  });
});

describe("anti baris kembar (exists, bukan join)", () => {
  it("daftar surveyor tidak memuat baris kembar saat di-assign ke proyek DAN dua fasenya", async () => {
    // projA1 sudah di-assign langsung ke surveyor A; tambahkan dua fase yang
    // juga miliknya. Kalau scope memakai join alih-alih exists, proyeknya
    // muncul tiga kali. (Dipindah dari auth-guards.test.ts lama.)
    await db.insert(projectPhases).values([
      { projectId: projA1, name: "F1", sortOrder: 1, assignedSurveyorId: surveyorA.id },
      { projectId: projA1, name: "F2", sortOrder: 2, assignedSurveyorId: surveyorA.id },
    ]);

    const ids = await scopedProjectIds(surveyorCtx);
    expect(ids.filter((id) => id === projA1)).toHaveLength(1);
  });
});

describe("scope inventaris tidak per-proyek", () => {
  it("surveyor punya equipment.read ber-scope all", async () => {
    expect(surveyorCtx.permissions.get("equipment.read")).toBe("all");
  });

  it("client tidak punya equipment.read sama sekali", async () => {
    expect(clientCtx.permissions.has("equipment.read")).toBe(false);
  });

  it("filter equipment untuk client menghasilkan himpunan kosong", async () => {
    const rows = await db
      .select({ id: projects.id })
      .from(projects)
      .where(rbacFilter(clientCtx, "equipment.read"));
    expect(rows).toEqual([]);
  });
});
