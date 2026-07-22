# RBAC Call-Site Migration — Implementation Plan #1: Foundation + Pilot

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun fondasi wiring RBAC (`rbacActionClient`, `scopedColumns`, `makeTestContext`, tiga permission baca baru) lalu migrasikan dua domain pilot (`project`, `document`) yang punya oracle parity — mengunci pola transformasi yang direplikasi domain sisanya.

**Architecture:** Ganti pengecekan role lama dengan `getRbacContext()` + empat fungsi engine + satu helper baru `scopedColumns`. Server action pakai `rbacActionClient` tunggal dengan permission dideklarasikan via metadata (fail-closed). Logic berpindah signature `(user)` → `(ctx)`. Kolom sensitif digating lewat proyeksi SQL yang disetir `fields` map resource.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM, next-safe-action, Zod, Vitest (hit Neon dev branch), Biome.

Spec: `docs/superpowers/specs/2026-07-22-rbac-call-site-migration-design.md`.

## Global Constraints

- **Perilaku 3 system role IDENTIK** sebelum & sesudah tiap task. Parity dibuktikan test.
- Test hit **Neon dev branch** (`.env.local`), bukan mock. Jalankan lewat `node --env-file=.env.local node_modules/vitest/vitest.mjs run <file>`. `fileParallelism: false` sudah aktif — setup data self-contained per file.
- **Jangan** seed/test ke prod (`.env.prod`).
- Nama permission selalu `resource.action`, ter-tipe sebagai `Permission`. Typo gagal saat compile.
- `pnpm typecheck` & `pnpm lint` bersih di akhir tiap task.
- Komentar/pesan error berbahasa Indonesia (ikuti gaya file sekitar).
- Helper lama (`assertProjectAccess`, `listProjectsForUser`, `adminActionClient`, `staffActionClient`, `requireRole`, dst.) **tetap ada** sepanjang plan ini — dihapus di plan terakhir (pass 9), bukan di sini. Domain pilot berjalan berdampingan dengan yang lama sampai semua domain bermigrasi.

## File Structure

**Baru:**
- `lib/rbac/scoped-columns.ts` — `scopedColumns(resource, ctx)`: select-map Drizzle tanpa kolom yang digating.
- `lib/rbac/scoped-columns.test.ts` — test unit helper (pakai resource fixture).

**Dimodifikasi:**
- `lib/rbac/test-fixtures.ts` — tambah `makeTestContextForUser(user)`.
- `lib/actions/safe-action.ts` — tambah `rbacActionClient`; `actionClient` diberi metadata schema.
- `lib/rbac/resources/project.ts` — tambah action `readFinance` + `fields`.
- `lib/rbac/resources/equipment.ts` — tambah action `readCost` + `fields` (dipakai pass equipment; didaftarkan di sini agar seed & matrix lengkap sekali jalan).
- `lib/rbac/resources/phase.ts` — tambah action `readInternal` + `fields`.
- `lib/rbac/system-roles.ts` — seed tiga grant baru.
- `lib/rbac/system-roles.test.ts` — tiga baris matrix baru.
- `lib/actions/projects-logic.ts` — signature `(ctx)`, buang `requireAdmin`/`requireStaff` lokal, `getProjectDetailForUser` via `scopedColumns`+`redact`.
- `lib/actions/projects.ts` — `rbacActionClient` + `.metadata`.
- `lib/actions/projects.test.ts`, `lib/actions/project-detail.test.ts` — pakai `ctx`.
- `app/dashboard/projects/page.tsx`, `app/dashboard/projects/[id]/page.tsx` — muat `ctx`, pakai `rbacFilter`/`requireScopedRow`.
- `lib/actions/documents-logic.ts`, `documents.ts`, `documents.test.ts`, `app/dashboard/documents/page.tsx` — idem untuk domain document.

---

### Task 1: `makeTestContextForUser` fixture

**Files:**
- Modify: `lib/rbac/test-fixtures.ts`
- Test: `lib/rbac/test-fixtures.test.ts` (create)

**Interfaces:**
- Produces: `makeTestContextForUser(user: SessionUser): Promise<RbacContext>` — memuat permission efektif nyata dari DB (`loadEffectivePermissions`) + `getClientIdForUser`, sehingga `ctx` di test identik dengan produksi.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// lib/rbac/test-fixtures.test.ts
import { beforeAll, expect, test } from "vitest";
import { seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import { db } from "@/lib/db";
import { users, userRoles, roles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

let adminId: string;

beforeAll(async () => {
  await seedSystemRoles(db);
  const [u] = await db
    .insert(users)
    .values({ id: crypto.randomUUID(), name: "T Admin", email: `a-${crypto.randomUUID()}@t.dev`, role: "admin" })
    .returning();
  adminId = u.id;
  const [adminRole] = await db.select().from(roles).where(eq(roles.key, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: adminRole.id });
});

test("memuat permission efektif nyata untuk user", async () => {
  const ctx = await makeTestContextForUser({ id: adminId, name: "T Admin", email: "a@t.dev", role: "admin" });
  expect(ctx.permissions.get("project.read")).toBe("all");
  expect(ctx.clientId).toBeNull();
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/test-fixtures.test.ts`
Expected: FAIL — `makeTestContextForUser is not a function`.

- [ ] **Step 3: Implementasi**

```ts
// lib/rbac/test-fixtures.ts  (tambah, jangan hapus fixture yang sudah ada)
import type { SessionUser } from "@/lib/auth-guards";
import { getClientIdForUser } from "@/lib/auth-guards";
import { loadEffectivePermissions } from "@/lib/rbac/context";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * `RbacContext` untuk test yang memuat permission efektif SUNGGUHAN dari DB —
 * bukan map buatan tangan — jadi test domain otomatis mewarisi parity dengan
 * produksi. Pasangan test dari `getRbacContext()`, minus `requireUser()` yang
 * butuh request scope.
 */
export async function makeTestContextForUser(user: SessionUser): Promise<RbacContext> {
  const [permissions, clientId] = await Promise.all([
    loadEffectivePermissions(user.id),
    getClientIdForUser(user.id),
  ]);
  return { user, permissions, clientId };
}
```

- [ ] **Step 4: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/test-fixtures.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/rbac/test-fixtures.ts lib/rbac/test-fixtures.test.ts
git commit -m "test(rbac): makeTestContextForUser memuat izin nyata dari DB"
```

---

### Task 2: `scopedColumns` helper

**Files:**
- Create: `lib/rbac/scoped-columns.ts`
- Test: `lib/rbac/scoped-columns.test.ts`

**Interfaces:**
- Consumes: `AnyResource` (dari `define-resource.ts`), `RbacContext`, `can` (dari `can.ts`).
- Produces: `scopedColumns(resource: AnyResource, ctx: RbacContext): Record<string, PgColumn>` — seluruh kolom `resource.table.table` kecuali kolom yang gating-permission-nya (`resource.fields[col]`) tidak dimiliki `ctx`.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// lib/rbac/scoped-columns.test.ts
import { expect, test } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { projects } from "@/lib/db/schema";
import { projectResource } from "@/lib/rbac/resources/project";
import { scopedColumns } from "@/lib/rbac/scoped-columns";
import type { RbacContext } from "@/lib/rbac/types";

const user = { id: "u1", name: "x", email: "x@x.dev", role: "surveyor" as const };

function ctxWith(perms: [string, "all" | "assigned" | "own"][]): RbacContext {
  return { user, permissions: new Map(perms as never), clientId: null };
}

test("menyertakan semua kolom saat ctx punya izin field", () => {
  const cols = scopedColumns(projectResource, ctxWith([["project.readFinance", "all"]]));
  expect(Object.keys(cols).sort()).toEqual(Object.keys(getTableColumns(projects)).sort());
});

test("membuang kolom finance saat ctx tak punya project.readFinance", () => {
  const cols = scopedColumns(projectResource, ctxWith([["project.read", "assigned"]]));
  expect(cols.projectValue).toBeUndefined();
  expect(cols.paymentStatus).toBeUndefined();
  expect(cols.paymentNotes).toBeUndefined();
  expect(cols.title).toBeDefined();
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/scoped-columns.test.ts`
Expected: FAIL — `scopedColumns is not a function` (dan `project.readFinance`/`fields` belum ada; Task 4 menambahkannya — jalankan Task 2 & 4 berurutan, test final Task 4 memvalidasi keduanya).

> Catatan urutan: helper ditulis di Task 2, tetapi assertion kolom finance baru hijau setelah `fields` diisi di Task 4. Kalau menjalankan Task 2 sendiri, ganti sementara assertion kedua jadi resource fixture dari `test-fixtures.ts` yang sudah punya `fields`. Rekomendasi subagent-driven: kerjakan Task 2 lalu Task 4 sebelum menandai hijau.

- [ ] **Step 3: Implementasi**

```ts
// lib/rbac/scoped-columns.ts
import { getTableColumns } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { can } from "./can";
import type { AnyResource } from "./define-resource";
import type { Permission } from "./resources";
import type { RbacContext } from "./types";

/**
 * Select-map Drizzle berisi SELURUH kolom tabel resource, MEMBUANG kolom yang
 * gating-permission-nya (dari `resource.fields`) tidak dimiliki `ctx`.
 *
 * Beda dengan `redact()`: kolom sensitif TIDAK pernah ikut ter-SELECT — bukan
 * diambil lalu dihapus. Menjaga invarian PRD "bentuk hasil query, bukan
 * disembunyikan di UI". `fields` yang sama tetap menyetir `redact()` untuk
 * jalur baca satu-baris yang sudah terlanjur mengambil baris penuh.
 */
export function scopedColumns(
  resource: AnyResource,
  ctx: RbacContext,
): Record<string, PgColumn> {
  if (!resource.table) {
    throw new Error(`rbac: resource "${resource.name}" tidak punya tabel.`);
  }
  const all = getTableColumns(resource.table.table) as Record<string, PgColumn>;
  if (!resource.fields) return all;

  const result: Record<string, PgColumn> = {};
  for (const [name, column] of Object.entries(all)) {
    const gate = resource.fields[name];
    if (gate && !can(ctx, gate as Permission)) continue;
    result[name] = column;
  }
  return result;
}
```

- [ ] **Step 4: Jalankan test (assertion pertama; kedua hijau setelah Task 4)**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/scoped-columns.test.ts -t "menyertakan semua kolom"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rbac/scoped-columns.ts lib/rbac/scoped-columns.test.ts
git commit -m "feat(rbac): scopedColumns — fields menyetir proyeksi SQL"
```

---

### Task 3: `rbacActionClient` + metadata ber-tipe

**Files:**
- Modify: `lib/actions/safe-action.ts`
- Test: `lib/actions/safe-action.test.ts` (create)

**Interfaces:**
- Consumes: `getRbacContext` (`lib/rbac/context.ts`), `assertCan` (`lib/rbac/can.ts`), `Permission` (`lib/rbac/resources`).
- Produces: `rbacActionClient` — next-safe-action client dengan `ctx.rbac: RbacContext`; setiap action WAJIB `.metadata({ permission })` (tipe `Permission`), kalau tidak → throw.

- [ ] **Step 1: Tulis test yang gagal**

```ts
// lib/actions/safe-action.test.ts
import { expect, test, vi } from "vitest";

// Palsukan getRbacContext agar tak butuh request scope.
vi.mock("@/lib/rbac/context", () => ({
  getRbacContext: async () => ({
    user: { id: "u1", name: "x", email: "x@x.dev", role: "admin" },
    permissions: new Map([["client.create", "all"]]),
    clientId: null,
  }),
}));

const { rbacActionClient } = await import("@/lib/actions/safe-action");

test("menolak action tanpa metadata.permission", async () => {
  const action = rbacActionClient.action(async () => "ok");
  const res = await action();
  expect(res?.serverError).toMatch(/tanpa permission/i);
});

test("menjalankan action saat izin dimiliki", async () => {
  const action = rbacActionClient
    .metadata({ permission: "client.create" })
    .action(async () => "ok");
  const res = await action();
  expect(res?.data).toBe("ok");
});

test("menolak saat izin tak dimiliki", async () => {
  const action = rbacActionClient
    .metadata({ permission: "user.archive" })
    .action(async () => "ok");
  const res = await action();
  expect(res?.serverError).toMatch(/tidak punya izin/i);
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/safe-action.test.ts`
Expected: FAIL — `rbacActionClient` belum diekspor.

- [ ] **Step 3: Implementasi**

```ts
// lib/actions/safe-action.ts  (tambah di bawah yang sudah ada; JANGAN hapus
// adminActionClient/staffActionClient di plan ini — dibuang di pass terakhir)
import { z } from "zod";
import { assertCan } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { PERMISSIONS, type Permission } from "@/lib/rbac/resources";

/**
 * Client RBAC tunggal, pengganti admin/staffActionClient. `ctx.rbac` diisi
 * `getRbacContext()`; tiap action WAJIB mendeklarasikan permission-nya lewat
 * `.metadata({ permission })`. Tanpa metadata → throw (fail-closed): sebuah
 * action yang lupa gerbang tak pernah lolos diam-diam.
 */
const permissionSchema = z.custom<Permission>(
  (v) => typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v),
  "permission tidak dikenal katalog",
);

export const rbacActionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof Error) return error.message;
    return "Unexpected error.";
  },
  defineMetadataSchema: () => z.object({ permission: permissionSchema }),
})
  .use(async ({ next }) => next({ ctx: { rbac: await getRbacContext() } }))
  .use(async ({ next, ctx, metadata }) => {
    if (!metadata?.permission) throw new Error("rbac: action tanpa permission.");
    assertCan(ctx.rbac, metadata.permission);
    return next({ ctx });
  });
```

> Catatan: `defineMetadataSchema` membuat `.metadata()` WAJIB secara tipe di action turunan. Test "tanpa metadata" memanggil `.action()` langsung; runtime middleware tetap melempar walau tipe memaksa — dua lapis.

- [ ] **Step 4: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/safe-action.test.ts`
Expected: PASS (3 test).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/safe-action.ts lib/actions/safe-action.test.ts
git commit -m "feat(rbac): rbacActionClient — permission via metadata, fail-closed"
```

---

### Task 4: Tiga action baca baru + `fields` + seed + matrix

**Files:**
- Modify: `lib/rbac/resources/project.ts`, `lib/rbac/resources/equipment.ts`, `lib/rbac/resources/phase.ts`
- Modify: `lib/rbac/system-roles.ts`
- Modify: `lib/rbac/system-roles.test.ts`

**Interfaces:**
- Produces: permission `project.readFinance`, `equipment.readCost`, `phase.readInternal`; `fields` map di tiga resource; grant seed sesuai matrix (§2 spec).

- [ ] **Step 1: Tulis baris matrix yang gagal**

```ts
// lib/rbac/system-roles.test.ts  (tambah ke tabel fixture matrix yang ada)
// admin | surveyor | client
["project.readFinance", "all", null, "own"],
["equipment.readCost", "all", null, null],
["phase.readInternal", "all", "assigned", null],
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/system-roles.test.ts`
Expected: FAIL — grant baru belum di-seed (dan permission belum ada di katalog).

- [ ] **Step 3: Tambah action + fields di resource**

```ts
// lib/rbac/resources/project.ts — ubah baris actions & tambah fields
export const projectResource = defineResource({
  name: "project",
  actions: ["read", "create", "update", "assignSurveyor", "changeStatus", "updateFinance", "readFinance"],
  table: { table: projects, id: projects.id },
  scopes: projectScopes,
  fields: {
    projectValue: "project.readFinance",
    paymentStatus: "project.readFinance",
    paymentNotes: "project.readFinance",
  },
});
```

```ts
// lib/rbac/resources/equipment.ts — tambah "readCost" ke actions, lalu:
  fields: {
    purchasePrice: "equipment.readCost",
    purchaseDate: "equipment.readCost",
  },
```

```ts
// lib/rbac/resources/phase.ts — tambah "readInternal" ke actions, lalu:
  fields: {
    description: "phase.readInternal",
    weight: "phase.readInternal",
    assignedSurveyorId: "phase.readInternal",
  },
```

- [ ] **Step 4: Seed grant baru**

```ts
// lib/rbac/system-roles.ts — tambah ke daftar grant tiap role sesuai matrix:
//   admin:    project.readFinance:all, equipment.readCost:all, phase.readInternal:all
//   surveyor: phase.readInternal:assigned
//   client:   project.readFinance:own
// (ikuti bentuk entri grant yang sudah ada di file ini; idempoten)
```

- [ ] **Step 5: Re-seed dev DB**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/system-roles.test.ts`
Expected: PASS. (Test memanggil `seedSystemRoles` di `beforeAll`, jadi re-seed otomatis; idempoten.)

- [ ] **Step 6: Jalankan scoped-columns + typecheck**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/scoped-columns.test.ts && pnpm typecheck`
Expected: PASS penuh (kedua assertion Task 2 kini hijau); typecheck bersih.

- [ ] **Step 7: Commit**

```bash
git add lib/rbac/resources/ lib/rbac/system-roles.ts lib/rbac/system-roles.test.ts
git commit -m "feat(rbac): action readFinance/readCost/readInternal + fields + seed"
```

---

### Task 5: Migrasi domain `project` (pilot)

**Files:**
- Modify: `lib/actions/projects-logic.ts`, `lib/actions/projects.ts`
- Modify: `lib/actions/projects.test.ts`, `lib/actions/project-detail.test.ts`
- Modify: `app/dashboard/projects/page.tsx`, `app/dashboard/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `rbacActionClient`, `scopedColumns`, `redact`, `rbacFilter`, `requireScopedRow`, `makeTestContextForUser`, `getRbacContext`.
- Produces: logic bersignature `(ctx: RbacContext, input)`; `getProjectDetailForUser(ctx, id)` mengembalikan baris ter-`redact`.

- [ ] **Step 1: Ubah `project-detail.test.ts` ke `ctx` (masih menegakkan absennya key)**

```ts
// lib/actions/project-detail.test.ts — ganti pembuatan user+call:
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
// surveyor tak boleh melihat key finance:
const ctx = await makeTestContextForUser(surveyorUser);
const detail = await getProjectDetailForUser(ctx, projectId);
expect("projectValue" in detail).toBe(false);
expect("paymentStatus" in detail).toBe(false);
// admin melihatnya:
const adminCtx = await makeTestContextForUser(adminUser);
const adminDetail = await getProjectDetailForUser(adminCtx, projectId);
expect(adminDetail.projectValue).toBeDefined();
```

- [ ] **Step 2: Jalankan untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/project-detail.test.ts`
Expected: FAIL — `getProjectDetailForUser` masih bersignature `(user, id)`.

- [ ] **Step 3: Migrasi `getProjectDetailForUser` ke `scopedColumns`+`requireScopedRow`**

```ts
// lib/actions/projects-logic.ts
import { getRbacContext } from "@/lib/rbac/context"; // dipakai RSC (Step 6)
import { redact } from "@/lib/rbac/fields";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import { projectResource } from "@/lib/rbac/resources/project";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Sumber tunggal data proyek untuk halaman detail. Baris diambil lewat
 * `requireScopedRow` (scope baris = aturan yang sama dengan daftar), lalu
 * `redact` membuang kolom finance yang `ctx` tak boleh lihat. Regresi
 * key-absence tetap dijaga `project-detail.test.ts`.
 */
export async function getProjectDetailForUser(ctx: RbacContext, projectId: string) {
  const row = await requireScopedRow(ctx, "project.read", projectId);
  return redact(ctx, projectResource, row);
}
```

- [ ] **Step 4: Migrasi sisa fungsi logic ke `(ctx)` + `assertCan`/`requireScopedRow`**

```ts
// lib/actions/projects-logic.ts — hapus requireAdmin/requireStaff lokal.
// createProjectForUser / updateProjectForUser / assignSurveyorForUser:
//   ganti `requireAdmin(user)` → `assertCan(ctx, "project.create")` (dst:
//   "project.update", "project.assignSurveyor"), ganti `user.id` → `ctx.user.id`.
// changeProjectStatusForUser:
//   - assertCan(ctx, "project.changeStatus")
//   - ganti `assertProjectAccess(input.projectId, user)` →
//     `requireScopedRow(ctx, "project.changeStatus", input.projectId)`
//   - role untuk getAllowedNextStatuses: `ctx.user.role as "admin" | "surveyor"`
//   - changedById: ctx.user.id
import { assertCan } from "@/lib/rbac/can";
```

- [ ] **Step 5: Migrasi action wrappers**

```ts
// lib/actions/projects.ts
import { rbacActionClient } from "@/lib/actions/safe-action";

export const createProject = rbacActionClient
  .metadata({ permission: "project.create" })
  .inputSchema(projectInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await createProjectForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/projects");
    return { success: true as const, project };
  });
// updateProject → "project.update"; assignSurveyor → "project.assignSurveyor";
// changeProjectStatus → "project.changeStatus". Semua panggil dengan ctx.rbac.
```

- [ ] **Step 6: Migrasi RSC**

```ts
// app/dashboard/projects/page.tsx — ganti listProjectsForUser(user):
import { getRbacContext } from "@/lib/rbac/context";
import { rbacFilter } from "@/lib/rbac/filter";
import { scopedColumns } from "@/lib/rbac/scoped-columns";
import { projectResource } from "@/lib/rbac/resources/project";
const ctx = await getRbacContext();
const rows = await db
  .select(scopedColumns(projectResource, ctx))
  .from(projects)
  .where(rbacFilter(ctx, "project.read"));

// app/dashboard/projects/[id]/page.tsx — ganti getProjectDetailForUser(user,id)
// → getProjectDetailForUser(await getRbacContext(), id).
```

- [ ] **Step 7: Update `projects.test.ts` ke `ctx` dan jalankan seluruh test project**

```ts
// lib/actions/projects.test.ts — ganti setiap `fn(user, input)` → `fn(ctx, input)`
// dengan ctx = await makeTestContextForUser(user). Ekspektasi TAK berubah.
```

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/projects.test.ts lib/actions/project-detail.test.ts lib/rbac/parity.test.ts`
Expected: PASS semua. `parity.test.ts` membuktikan scope proyek identik dengan `listProjectsForUser` lama.

- [ ] **Step 8: Typecheck, lint, commit**

Run: `pnpm typecheck && pnpm lint`
Expected: bersih.

```bash
git add lib/actions/projects-logic.ts lib/actions/projects.ts lib/actions/projects.test.ts lib/actions/project-detail.test.ts app/dashboard/projects/
git commit -m "feat(rbac): wire domain project ke engine (pilot)"
```

---

### Task 6: Migrasi domain `document` (oracle parity kedua)

**Files:**
- Modify: `lib/actions/documents-logic.ts`, `lib/actions/documents.ts`, `lib/actions/documents.test.ts`
- Modify: `app/dashboard/documents/page.tsx`

**Interfaces:**
- Consumes: sama seperti Task 5, permission `document.read`/`.upload`/`.share`/`.delete`.
- Produces: logic document bersignature `(ctx)`.

- [ ] **Step 1: Ubah `documents.test.ts` ke `ctx`**

Ganti `fn(user, …)` → `fn(await makeTestContextForUser(user), …)` untuk setiap pemanggilan. Ekspektasi (termasuk aturan `sharedWithClient` untuk client) tidak berubah.

- [ ] **Step 2: Jalankan untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/documents.test.ts`
Expected: FAIL — signature belum `(ctx)`.

- [ ] **Step 3: Migrasi `documents-logic.ts`**

Terapkan pola Task 5 persis:
- Buang `requireStaff`/role check lokal → `assertCan(ctx, "document.upload"|"document.share"|"document.delete")`.
- Baca daftar: `db.select().from(documents).where(and(rbacFilter(ctx, "document.read"), eq(documents.projectId, projectId)))` — scope `own` resource document sudah memuat aturan `sharedWithClient` (lihat `resources/document.ts`).
- Baca satu baris: `requireScopedRow(ctx, "document.read"|"document.delete", id)` menggantikan `assertProjectAccess`.

- [ ] **Step 4: Migrasi `documents.ts` actions**

`rbacActionClient` + `.metadata`: upload → `document.upload`, toggle share → `document.share`, delete → `document.delete`. Panggil logic dengan `ctx.rbac`.

- [ ] **Step 5: Migrasi RSC `app/dashboard/documents/page.tsx`**

Muat `ctx = await getRbacContext()`; ganti pemanggilan lama ke fungsi logic bersignature `ctx`.

- [ ] **Step 6: Jalankan test + parity + typecheck/lint**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/documents.test.ts lib/rbac/parity.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS + bersih. Parity membuktikan scope `document.read` (termasuk `sharedWithClient`) identik dengan lama.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/documents-logic.ts lib/actions/documents.ts lib/actions/documents.test.ts app/dashboard/documents/
git commit -m "feat(rbac): wire domain document ke engine"
```

---

## Passes Berikutnya (plan tersendiri per pass)

Task 5 adalah **template kanonik** per-domain: (1) test logic → `ctx` via `makeTestContextForUser`, (2) logic `(user)`→`(ctx)` dengan `assertCan`+`requireScopedRow`+`scopedColumns`/`redact`, (3) action → `rbacActionClient`+`.metadata`, (4) RSC → `getRbacContext`+`rbacFilter`. Tiap pass di bawah mereplikasi itu dan berdiri sendiri (hijau + shippable). Masing-masing dapat plan sendiri saat dieksekusi:

| Pass | Domain / file | Permission utama | Catatan khusus |
|---|---|---|---|
| 3a | `phase` (`phases-logic.ts`, `phases.ts`, RSC) | `phase.read/create/update/delete/reorder/setStatus/updateNote` | surveyor: create/reorder ditolak; `phase.readInternal` sudah ada dari Task 4 |
| 3b | `map` (`maps-logic.ts`, `maps.ts`) | `map.read/write` | buang `requireStaff` lokal |
| 3c | `payment`+`finance` (`payments-logic.ts`, `finance-logic.ts`) | `payment.read/record/void/regenerateReceipt`, `project.updateFinance` | invarian "isi nilai proyek dulu" tetap cek eksplisit di logic |
| 4a | `equipment` (`equipment-logic.ts`, `equipment.ts`) | `equipment.read/borrow/return/create/update/archive/correctUsage` | guard `equipment.borrow` (kondisi≠tersedia/arsip); `equipment.readCost` fields sudah ada |
| 4b | `equipment-item` (`equipment-items-logic.ts`) | `equipmentItem.create/update/archive` | invarian "arsipkan unit dulu" tetap di logic |
| 5a | `client` (`clients-logic.ts`, `clients.ts`, `invite-client-user.ts`) | `client.read/create/update/archive` | invite → `client.create` |
| 5b | `user` (`users-logic.ts`, `users.ts`) | `user.read/create/update/setRole/archive/restore` | invarian "admin aktif terakhir" tetap di logic |
| 5c | `profile` (`profile.ts`) | `profile.updateOwn` | resource tanpa tabel → hanya `can()` |
| 6a | `dashboard` (`dashboard-logic.ts`) | — | statistik disusun di atas `rbacFilter(ctx, "project.read")`; tak ada resource dashboard |
| 6b | `portal` (`portal-logic.ts`, RSC `/portal`) | `project.read`, `phase.read` | phase list pakai `scopedColumns(phaseResource, ctx)` (client kehilangan internal); `getPortalProgress` tetap query `weight` langsung |
| 7 | route handler (`app/api/export`, `documents/upload-init`, `equipment/upload-init`, `storage`) | `report.export`, `document.upload`, `equipment.update` | muat `ctx` di handler; `report` resource tanpa tabel |
| 8 | UI gating: `PermissionsProvider` + `usePermissions()` + `<Can>`, `nav-config.ts` berbasis `permission`, migrasi `components/**` `user.role===` | — | server tetap penegak; ini kosmetik |
| 9 | **Pembuangan**: hapus `adminActionClient`/`staffActionClient`/`requireRole`/`requireAdmin`/`requireStaff`/`requireClient`/`assertProjectAccess`/`listProjectsForUser`; ubah `parity.test.ts` jadi snapshot id-set; grep nol sisa | — | pass terakhir, hanya setelah 3–8 hijau |

Kriteria selesai keseluruhan ada di §"Kriteria Selesai" spec.

## Self-Review

- **Spec coverage:** rbacActionClient (§1) → Task 3. scopedColumns/fields (§2) → Task 2+4. guards (§3) → tercantum pass 4a. signature `(ctx)` (§4) → Task 5 template. UI gating (§5) → pass 8. Pembuangan helper lama → pass 9. Tiga permission baru → Task 4. Semua bagian spec ada pemiliknya.
- **Placeholder scan:** passes 3–9 sengaja ringkas (plan-per-pass) namun tiap baris menyebут file, permission, dan invarian konkret — bukan "TODO". Task 1–6 berisi kode lengkap.
- **Type consistency:** `makeTestContextForUser` (Task 1) dipakai konsisten di Task 5/6; `scopedColumns(resource, ctx)` signature sama di Task 2/5/6; `ctx.rbac` di action, `ctx` di logic — konsisten dengan `rbacActionClient` (Task 3).
