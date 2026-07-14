# Timeline Fase Proyek — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tiap proyek bisa punya fase pekerjaan dinamis (nama, urutan, bobot, penanggung jawab, target) yang menghasilkan persen progres turunan, terlihat read-only oleh klien di portal.

**Architecture:** Satu tabel baru `project_phase`. Fungsi murni (progres, telat, urutan) di `lib/phases/derive.ts`. Logika ber-guard + DB di `lib/actions/phases-logic.ts`, dibungkus server action tipis di `lib/actions/phases.ts`. `assertProjectAccess` / `listProjectsForUser` diperluas: surveyor yang di-assign ke sebuah fase mendapat akses ke proyeknya.

**Tech Stack:** Next.js App Router (RSC), Drizzle ORM + Postgres (Neon), next-safe-action, zod, react-hook-form, Vitest (DB dev sungguhan), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-timeline-fase-proyek-design.md`

## Global Constraints

- **Pola berkas repo** (ikuti, jangan karang sendiri): fungsi **murni** → `lib/<domain>/derive.ts` + `derive.test.ts` (tanpa fixture, tanpa DB). Logika **ber-guard + DB** → `lib/actions/<domain>-logic.ts`, diuji `lib/actions/<domain>.test.ts` lawan DB dev sungguhan. Skema zod → `lib/actions/<domain>-schemas.ts` (boleh diimpor komponen klien). Server action `"use server"` → `lib/actions/<domain>.ts`, tipis, **selalu** memakai `adminActionClient` / `staffActionClient` / `authActionClient` dari `lib/actions/safe-action.ts`. (Catatan: spec menyebut `phases-logic.test.ts` untuk test murni — plan ini memakai `lib/phases/derive.test.ts` supaya konsisten dengan `lib/payments/derive.ts`. Ikuti plan.)
- **Guard adalah satu-satunya batas.** Setiap RSC/action yang menyentuh data proyek WAJIB lewat `assertProjectAccess` / `listProjectsForUser` (`lib/auth-guards.ts`). Jangan pernah `db.select().from(projects)` langsung dari route.
- **UI bukan batas keamanan.** Field yang tidak boleh dilihat sebuah peran dipangkas **di level query**, bukan disembunyikan di render.
- **Bahasa UI: Indonesia.** Label enum lewat `lib/labels.ts`, jangan hardcode di komponen.
- **Perintah:** test `pnpm test`, satu berkas `pnpm test lib/phases/derive.test.ts`. Typecheck `pnpm typecheck`. Lint `pnpm lint`. Migrasi `pnpm db:generate` lalu `pnpm db:migrate`. E2E `pnpm e2e`.
- **Enum `project_phase_status`:** `belum` | `berjalan` | `selesai`. Persis tiga, tanpa tambahan.
- **`weight` default 1.** Progres = Σ bobot fase `selesai` ÷ Σ bobot semua fase × 100, dibulatkan. Fase `berjalan` = 0. Tanpa fase, atau total bobot 0 → **`null`**, bukan 0.
- Commit tiap akhir task. Pesan commit Indonesia, prefix conventional (`feat:`, `test:`, `docs:`).

---

### Task 1: Skema `project_phase` + migrasi

**Files:**
- Modify: `lib/db/schema.ts` (tambah enum + tabel + relasi, setelah blok `documents`)
- Create: `drizzle/migrations/<generated>.sql` (dihasilkan `pnpm db:generate`)

**Interfaces:**
- Consumes: tabel `projects`, `users` yang sudah ada.
- Produces: `projectPhases` (tabel drizzle), enum `projectPhaseStatus`, tipe baris `typeof projectPhases.$inferSelect`.

- [ ] **Step 1: Tambah enum + tabel di `lib/db/schema.ts`**

Setelah deklarasi enum lain (dekat `mapLayerSource`, ~line 47) tambahkan:

```ts
export const projectPhaseStatus = pgEnum("project_phase_status", [
  "belum",
  "berjalan",
  "selesai",
]);
```

Setelah tabel `documents` (~line 226) tambahkan:

```ts
/**
 * Fase pekerjaan per proyek (spec 2026-07-14). Melengkapi `projects.status`,
 * BUKAN menggantikannya: status pipeline tetap ringkasan kasar yang dipakai
 * filter, papan, dan notifikasi.
 *
 * `completedAt` diisi/dikosongkan OTOMATIS oleh transisi status (lihat
 * `phases-logic.ts`) — tidak pernah diketik manusia. Tanggal selesai yang bisa
 * diketik akan berbeda dari statusnya, dan salah satunya pasti bohong.
 *
 * Persen progres TIDAK disimpan di sini: ia diturunkan dari `weight` +
 * `status` (`lib/phases/derive.ts`), pelajaran yang sama dengan
 * `paymentStatus` di Phase 12.
 */
export const projectPhases = pgTable(
  "project_phase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Catatan INTERNAL — tidak pernah dikirim ke klien (dipangkas di query portal).
    description: text("description"),
    sortOrder: integer("sort_order").notNull(),
    status: projectPhaseStatus("status").notNull().default("belum"),
    // Bobot progres. Default 1 = semua fase setara, sehingga studio yang tidak
    // peduli bobot tetap dapat persen yang masuk akal tanpa isian tambahan.
    weight: integer("weight").notNull().default(1),
    assignedSurveyorId: text("assigned_surveyor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Tanggal KALENDER, mode string (`YYYY-MM-DD`) — alasan sama dengan
    // `payment.paidAt`: `Date` di server ber-offset negatif bisa menggesernya sehari.
    targetDate: date("target_date", { mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("project_phase_project_id_idx").on(t.projectId),
    index("project_phase_assigned_surveyor_id_idx").on(t.assignedSurveyorId),
  ],
);
```

Tambahkan `integer` ke import `drizzle-orm/pg-core` di baris 2-14 (sekarang belum ada).

- [ ] **Step 2: Relasi**

Di blok relasi, tambahkan `phases: many(projectPhases)` ke `projectsRelations` (setelah `documents: many(documents)`), lalu:

```ts
export const projectPhasesRelations = relations(projectPhases, ({ one }) => ({
  project: one(projects, { fields: [projectPhases.projectId], references: [projects.id] }),
  assignedSurveyor: one(users, {
    fields: [projectPhases.assignedSurveyorId],
    references: [users.id],
  }),
}));
```

- [ ] **Step 3: Generate migrasi**

Run: `pnpm db:generate`
Expected: berkas baru `drizzle/migrations/00XX_*.sql` berisi `CREATE TYPE "public"."project_phase_status"` dan `CREATE TABLE "project_phase"`.

- [ ] **Step 4: Terapkan ke DB dev**

Run: `pnpm db:migrate`
Expected: `[✓] migrations applied successfully!`

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: keluar tanpa error.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/migrations/
git commit -m "feat(fase): tabel project_phase + enum status fase"
```

---

### Task 2: Fungsi murni — progres, telat, urutan

**Files:**
- Create: `lib/phases/derive.ts`
- Test: `lib/phases/derive.test.ts`

**Interfaces:**
- Produces:
  - `type PhaseProgressInput = { status: "belum" | "berjalan" | "selesai"; weight: number }`
  - `calculateProgress(phases: PhaseProgressInput[]): number | null`
  - `isPhaseLate(phase: { targetDate: string | null; status: PhaseStatus }, today: string): boolean` — `today` dalam `YYYY-MM-DD`, **di-inject** (bukan `new Date()` di dalam) supaya test tidak flaky.
  - `nextSortOrder(existing: { sortOrder: number }[]): number`
  - `resequence(orderedIds: string[]): { id: string; sortOrder: number }[]` — menghasilkan `sortOrder` rapat `0..n-1`.
  - `completedAtFor(status: PhaseStatus, now: Date, previous: Date | null): Date | null`
  - `todayString(now: Date): string` — tanggal hari ini **di zona Asia/Jakarta**, `YYYY-MM-DD`. Dipakai sebagai argumen `today` untuk `isPhaseLate`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/phases/derive.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  calculateProgress,
  completedAtFor,
  isPhaseLate,
  nextSortOrder,
  resequence,
  todayString,
} from "@/lib/phases/derive";

describe("calculateProgress", () => {
  it("menghitung dari bobot fase yang selesai", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 3 },
        { status: "berjalan", weight: 1 },
        { status: "belum", weight: 1 },
      ]),
    ).toBe(60); // 3 / 5
  });

  it("semua fase selesai -> 100", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 1 },
        { status: "selesai", weight: 4 },
      ]),
    ).toBe(100);
  });

  // Fase 'berjalan' dihitung NOL, bukan setengah. "Setengah selesai" adalah
  // klaim, bukan fakta; kalau pekerjaannya perlu dibelah, belah fasenya.
  it("fase berjalan dihitung nol", () => {
    expect(calculateProgress([{ status: "berjalan", weight: 1 }])).toBe(0);
  });

  // null, BUKAN 0. Nol berarti "sudah punya rencana, belum dikerjakan";
  // null berarti "belum pakai timeline" — UI tidak boleh menampilkan 0%
  // untuk proyek yang cuma belum memakai fitur ini.
  it("proyek tanpa fase -> null", () => {
    expect(calculateProgress([])).toBeNull();
  });

  it("total bobot nol -> null, bukan pembagian nol", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 0 },
        { status: "belum", weight: 0 },
      ]),
    ).toBeNull();
  });

  it("membulatkan ke bilangan bulat", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 1 },
        { status: "belum", weight: 1 },
        { status: "belum", weight: 1 },
      ]),
    ).toBe(33);
  });
});

describe("isPhaseLate", () => {
  it("target lewat dan belum selesai -> telat", () => {
    expect(isPhaseLate({ targetDate: "2026-07-01", status: "berjalan" }, "2026-07-14")).toBe(true);
  });

  it("target lewat tapi sudah selesai -> tidak telat", () => {
    expect(isPhaseLate({ targetDate: "2026-07-01", status: "selesai" }, "2026-07-14")).toBe(false);
  });

  it("tanpa target -> tidak pernah telat", () => {
    expect(isPhaseLate({ targetDate: null, status: "belum" }, "2026-07-14")).toBe(false);
  });

  it("target hari ini -> belum telat", () => {
    expect(isPhaseLate({ targetDate: "2026-07-14", status: "belum" }, "2026-07-14")).toBe(false);
  });
});

describe("nextSortOrder", () => {
  it("kosong -> 0", () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it("satu lebih besar dari yang terbesar", () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 4 }])).toBe(5);
  });
});

describe("resequence", () => {
  it("menghasilkan sortOrder rapat 0..n-1 tanpa kembar", () => {
    expect(resequence(["c", "a", "b"])).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });
});

describe("todayString", () => {
  // Server berjalan UTC. Jam 06:00 WIB (= 23:00 UTC hari SEBELUMNYA) masih
  // tanggal 14 di Jakarta — kalau kita pakai tanggal UTC, penanda "Telat" akan
  // menyala sehari lebih cepat/lambat dari kenyataan di lapangan.
  it("memakai zona Asia/Jakarta, bukan UTC", () => {
    expect(todayString(new Date("2026-07-13T23:00:00Z"))).toBe("2026-07-14");
  });

  it("format YYYY-MM-DD", () => {
    expect(todayString(new Date("2026-07-14T05:00:00Z"))).toBe("2026-07-14");
  });
});

describe("completedAtFor", () => {
  const now = new Date("2026-07-14T10:00:00Z");

  it("mengisi saat status jadi selesai", () => {
    expect(completedAtFor("selesai", now, null)).toEqual(now);
  });

  it("mempertahankan tanggal selesai lama kalau tetap selesai", () => {
    const before = new Date("2026-07-01T00:00:00Z");
    expect(completedAtFor("selesai", now, before)).toEqual(before);
  });

  // Mundur dari 'selesai' HARUS mengosongkan completedAt — kalau tidak, fase
  // berstatus 'berjalan' tetap membawa tanggal selesai, dan salah satunya bohong.
  it("mengosongkan saat status mundur dari selesai", () => {
    expect(completedAtFor("berjalan", now, new Date("2026-07-01T00:00:00Z"))).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `pnpm test lib/phases/derive.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/phases/derive"`.

- [ ] **Step 3: Implementasi minimal**

Buat `lib/phases/derive.ts`:

```ts
/**
 * Fungsi murni di balik timeline fase (spec 2026-07-14). Tidak menyentuh DB —
 * aturan progresnya bisa diuji tanpa fixture apa pun.
 */

export type PhaseStatus = "belum" | "berjalan" | "selesai";

export type PhaseProgressInput = { status: PhaseStatus; weight: number };

/**
 * Persen progres proyek. SATU-SATUNYA tempat yang memutuskan angka ini — ia
 * kolom turunan, bukan isian.
 *
 * Mengembalikan `null` (bukan 0) untuk proyek tanpa fase atau yang total
 * bobotnya 0: "belum pakai timeline" berbeda dari "0% dikerjakan", dan UI harus
 * bisa membedakannya.
 */
export function calculateProgress(phases: PhaseProgressInput[]): number | null {
  const total = phases.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0) return null;

  const done = phases
    .filter((p) => p.status === "selesai")
    .reduce((sum, p) => sum + p.weight, 0);

  return Math.round((done / total) * 100);
}

/** `today` di-inject (`YYYY-MM-DD`) — jangan panggil `new Date()` di sini, test jadi flaky. */
export function isPhaseLate(
  phase: { targetDate: string | null; status: PhaseStatus },
  today: string,
): boolean {
  if (!phase.targetDate) return false;
  if (phase.status === "selesai") return false;
  return phase.targetDate < today;
}

export function nextSortOrder(existing: { sortOrder: number }[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((p) => p.sortOrder)) + 1;
}

/**
 * Susun ulang = tulis ULANG seluruh urutan jadi 0..n-1, bukan menukar dua baris.
 * Menukar dua baris meninggalkan celah/kembar kalau ada dua aksi bersamaan.
 */
export function resequence(orderedIds: string[]): { id: string; sortOrder: number }[] {
  return orderedIds.map((id, i) => ({ id, sortOrder: i }));
}

/**
 * Tanggal hari ini DI JAKARTA (`YYYY-MM-DD`), bukan di UTC.
 *
 * `targetDate` adalah tanggal kalender Indonesia. Server berjalan UTC, jadi
 * `now.toISOString().slice(0, 10)` akan salah sehari untuk sepanjang jam 00:00-
 * 07:00 WIB — dan penanda "Telat" ikut salah sehari. `en-CA` dipilih karena ia
 * memformat sebagai `YYYY-MM-DD`.
 */
export function todayString(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `completedAt` diturunkan dari status — tidak pernah diketik manusia. */
export function completedAtFor(
  status: PhaseStatus,
  now: Date,
  previous: Date | null,
): Date | null {
  if (status !== "selesai") return null;
  return previous ?? now;
}
```

- [ ] **Step 4: Jalankan, pastikan LULUS**

Run: `pnpm test lib/phases/derive.test.ts`
Expected: PASS, 15 test.

- [ ] **Step 5: Commit**

```bash
git add lib/phases/
git commit -m "feat(fase): fungsi murni progres, telat, dan urutan fase"
```

---

### Task 3: Perluas guard — fase memberi akses proyek

**Files:**
- Modify: `lib/auth-guards.ts:112-153` (`assertProjectAccess`, `listProjectsForUser`)
- Test: `lib/auth-guards.test.ts` (tambahkan test, jangan hapus yang ada)

**Interfaces:**
- Consumes: `projectPhases` dari Task 1.
- Produces: perilaku guard yang diandalkan SEMUA task berikutnya — surveyor lolos kalau di-assign ke proyek **atau** ke salah satu fasenya.

- [ ] **Step 1: Tulis test yang gagal**

Baca dulu `lib/auth-guards.test.ts` untuk memakai fixture yang sudah ada. Tambahkan blok:

```ts
describe("akses lewat fase (spec 2026-07-14)", () => {
  it("surveyor yang di-assign HANYA ke sebuah fase bisa membuka proyeknya, DAN proyek itu muncul di daftarnya", async () => {
    // Proyek ini TIDAK di-assign ke siapa pun di kolom assignedSurveyorId.
    const [project] = await db
      .insert(projects)
      .values({
        title: "Proyek lewat fase",
        clientId,
        surveyType: "kavling",
        assignedSurveyorId: null,
      })
      .returning();

    await db.insert(projectPhases).values({
      projectId: project.id,
      name: "Olah data",
      sortOrder: 0,
      assignedSurveyorId: surveyor.id,
    });

    // Dua-duanya dalam SATU test: kalau guard lolos tapi daftar tidak memuatnya,
    // proyeknya "ada" tapi tak bisa ditemukan — fiturnya patah tanpa ketahuan.
    await expect(assertProjectAccess(project.id, surveyor)).resolves.toMatchObject({
      id: project.id,
    });

    const listed = await listProjectsForUser(surveyor);
    expect(listed.map((p) => p.id)).toContain(project.id);
  });

  it("surveyor yang tidak di-assign ke proyek MAUPUN fase tetap ditolak", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        title: "Bukan punya siapa-siapa",
        clientId,
        surveyType: "kavling",
        assignedSurveyorId: null,
      })
      .returning();

    await expect(assertProjectAccess(project.id, surveyor)).rejects.toThrow();

    const listed = await listProjectsForUser(surveyor);
    expect(listed.map((p) => p.id)).not.toContain(project.id);
  });

  it("daftar proyek surveyor tidak memuat baris kembar kalau ia di-assign ke proyek DAN dua fasenya", async () => {
    const [project] = await db
      .insert(projects)
      .values({
        title: "Assigned dua kali",
        clientId,
        surveyType: "kavling",
        assignedSurveyorId: surveyor.id,
      })
      .returning();

    await db.insert(projectPhases).values([
      { projectId: project.id, name: "F1", sortOrder: 0, assignedSurveyorId: surveyor.id },
      { projectId: project.id, name: "F2", sortOrder: 1, assignedSurveyorId: surveyor.id },
    ]);

    const listed = await listProjectsForUser(surveyor);
    expect(listed.filter((p) => p.id === project.id)).toHaveLength(1);
  });
});
```

Tambahkan `projectPhases` ke import `@/lib/db/schema` di berkas itu, dan pastikan `beforeAll`-nya juga membersihkan `projectPhases` (sebelum `projects`, karena FK).

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `pnpm test lib/auth-guards.test.ts`
Expected: FAIL — test pertama gagal di `assertProjectAccess` (notFound), test ketiga bisa lolos kebetulan.

- [ ] **Step 3: Implementasi**

Di `lib/auth-guards.ts`, perluas import jadi `import { and, eq, exists, or, sql } from "drizzle-orm";` (sekarang cuma `eq`) dan tambahkan `projectPhases` ke import schema. Jangan impor yang tidak dipakai — biome menolaknya.

Ganti cabang surveyor di `assertProjectAccess` (line 118-121):

```ts
  if (user.role === "surveyor") {
    if (project.assignedSurveyorId === user.id) return project;
    // Di-assign ke salah satu FASE proyek ini juga memberi akses (spec
    // 2026-07-14). Tanpa ini, menugaskan surveyor ke sebuah fase tidak
    // memberinya apa pun dan fiturnya cuma hiasan.
    const [phase] = await db
      .select({ id: projectPhases.id })
      .from(projectPhases)
      .where(
        and(
          eq(projectPhases.projectId, project.id),
          eq(projectPhases.assignedSurveyorId, user.id),
        ),
      )
      .limit(1);
    if (phase) return project;
    notFound();
  }
```

Ganti cabang surveyor di `listProjectsForUser` (line 142-144):

```ts
  if (user.role === "surveyor") {
    // Aturan HARUS sama persis dengan `assertProjectAccess` di atas. Kalau
    // hanya guard yang diperluas, proyeknya bisa dibuka lewat URL langsung tapi
    // tidak muncul di daftar — dalam praktik, tidak bisa ditemukan.
    // `exists` (bukan join) supaya proyek dengan dua fase milik orang yang sama
    // tidak muncul dua kali.
    return db
      .select()
      .from(projects)
      .where(
        or(
          eq(projects.assignedSurveyorId, user.id),
          exists(
            db
              .select({ one: sql`1` })
              .from(projectPhases)
              .where(
                and(
                  eq(projectPhases.projectId, projects.id),
                  eq(projectPhases.assignedSurveyorId, user.id),
                ),
              ),
          ),
        ),
      );
  }
```

Import juga `or` dan `sql` dari `drizzle-orm`.

- [ ] **Step 4: Jalankan, pastikan LULUS**

Run: `pnpm test lib/auth-guards.test.ts`
Expected: PASS — termasuk semua test lama (surveyor tak ter-assign tetap ditolak, klien tetap terkurung ke proyeknya).

- [ ] **Step 5: Commit**

```bash
git add lib/auth-guards.ts lib/auth-guards.test.ts
git commit -m "feat(fase): assign fase memberi surveyor akses ke proyeknya"
```

---

### Task 4: Skema input + logika ber-guard

**Files:**
- Create: `lib/actions/phases-schemas.ts`
- Create: `lib/actions/phases-logic.ts`
- Test: `lib/actions/phases.test.ts`

**Interfaces:**
- Consumes: `calculateProgress`, `completedAtFor`, `nextSortOrder`, `resequence` (Task 2); `assertProjectAccess` (Task 3).
- Produces:
  - `listPhasesForProject(user, projectId): Promise<PhaseRow[]>`
  - `getProjectProgress(user, projectId): Promise<number | null>`
  - `createPhaseForUser(user, input: CreatePhaseInput): Promise<PhaseRow>` — admin-only
  - `updatePhaseForUser(user, input: UpdatePhaseInput): Promise<PhaseRow>` — admin-only
  - `setPhaseStatusForUser(user, input: SetPhaseStatusInput): Promise<PhaseRow>` — admin **atau** surveyor ber-akses
  - `updatePhaseNoteForUser(user, input: UpdatePhaseNoteInput): Promise<PhaseRow>` — admin **atau** surveyor ber-akses
  - `deletePhaseForUser(user, input: DeletePhaseInput): Promise<{ projectId: string }>` — admin-only
  - `reorderPhasesForUser(user, input: ReorderPhasesInput): Promise<PhaseRow[]>` — admin-only
  - `PhaseRow` = `typeof projectPhases.$inferSelect`

- [ ] **Step 1: Skema input**

Buat `lib/actions/phases-schemas.ts`:

```ts
import { z } from "zod";

/**
 * Skema input timeline fase. Dipisah dari `phases-logic.ts` (server-only)
 * mengikuti pola `payments-schemas.ts` — komponen klien boleh mengimpor skema,
 * tidak boleh mengimpor logika.
 */

export const phaseStatusSchema = z.enum(["belum", "berjalan", "selesai"]);
export type PhaseStatusInput = z.infer<typeof phaseStatusSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus dalam format YYYY-MM-DD.");

export const createPhaseInputSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Nama fase wajib diisi.").max(120),
  description: z.string().trim().max(1000).optional(),
  // Bobot minimal 1: bobot 0 membuat fase itu tidak pernah menggerakkan progres,
  // yang berarti mengerjakannya tidak berarti apa-apa — kalau memang begitu,
  // fase itu tidak perlu ada.
  weight: z.number().int().min(1, "Bobot minimal 1.").max(100).default(1),
  assignedSurveyorId: z.string().min(1).nullable().optional(),
  targetDate: dateString.nullable().optional(),
});
export type CreatePhaseInput = z.infer<typeof createPhaseInputSchema>;

export const updatePhaseInputSchema = z.object({
  phaseId: z.uuid(),
  name: z.string().trim().min(1, "Nama fase wajib diisi.").max(120),
  description: z.string().trim().max(1000).optional(),
  weight: z.number().int().min(1, "Bobot minimal 1.").max(100),
  assignedSurveyorId: z.string().min(1).nullable().optional(),
  targetDate: dateString.nullable().optional(),
});
export type UpdatePhaseInput = z.infer<typeof updatePhaseInputSchema>;

export const setPhaseStatusInputSchema = z.object({
  phaseId: z.uuid(),
  status: phaseStatusSchema,
});
export type SetPhaseStatusInput = z.infer<typeof setPhaseStatusInputSchema>;

export const updatePhaseNoteInputSchema = z.object({
  phaseId: z.uuid(),
  description: z.string().trim().max(1000),
});
export type UpdatePhaseNoteInput = z.infer<typeof updatePhaseNoteInputSchema>;

export const deletePhaseInputSchema = z.object({ phaseId: z.uuid() });
export type DeletePhaseInput = z.infer<typeof deletePhaseInputSchema>;

export const reorderPhasesInputSchema = z.object({
  projectId: z.uuid(),
  // Urutan BARU, lengkap. Bukan "pindahkan satu" — lihat `resequence`.
  orderedPhaseIds: z.array(z.uuid()).min(1),
});
export type ReorderPhasesInput = z.infer<typeof reorderPhasesInputSchema>;
```

- [ ] **Step 2: Tulis test yang gagal**

Buat `lib/actions/phases.test.ts`. Contoh fixture ada di `lib/actions/payments.test.ts` (`beforeAll` bikin admin/surveyor/klien + proyek; `afterAll` bersih-bersih) — tiru itu, dengan tambahan `projectPhases` di daftar tabel yang dibersihkan (sebelum `projects`).

Test yang WAJIB ada:

```ts
describe("batas akses", () => {
  it("surveyor tidak bisa menambah fase, walau proyeknya di-assign ke dia", async () => {
    await expect(
      createPhaseForUser(surveyor, { projectId, name: "Curang", weight: 1 }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa menghapus fase", async () => {
    const phase = await createPhaseForUser(admin, { projectId, name: "F1", weight: 1 });
    await expect(deletePhaseForUser(surveyor, { phaseId: phase.id })).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa menyusun ulang fase", async () => {
    const a = await createPhaseForUser(admin, { projectId, name: "A", weight: 1 });
    const b = await createPhaseForUser(admin, { projectId, name: "B", weight: 1 });
    await expect(
      reorderPhasesForUser(surveyor, { projectId, orderedPhaseIds: [b.id, a.id] }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengubah bobot lewat updatePhase", async () => {
    const phase = await createPhaseForUser(admin, { projectId, name: "F1", weight: 1 });
    await expect(
      updatePhaseForUser(surveyor, { phaseId: phase.id, name: "F1", weight: 99 }),
    ).rejects.toThrow(/admin/i);
  });

  // Yang BOLEH dilakukan surveyor — pekerjaan lapangan, bukan rencana.
  it("surveyor ber-akses BISA mengubah status fase dan mengisi catatan", async () => {
    const phase = await createPhaseForUser(admin, { projectId, name: "Ukur", weight: 1 });

    const updated = await setPhaseStatusForUser(surveyor, {
      phaseId: phase.id,
      status: "selesai",
    });
    expect(updated.status).toBe("selesai");
    expect(updated.completedAt).not.toBeNull();

    const noted = await updatePhaseNoteForUser(surveyor, {
      phaseId: phase.id,
      description: "Titik 12 tertutup bangunan.",
    });
    expect(noted.description).toBe("Titik 12 tertutup bangunan.");
  });

  it("surveyor TIDAK bisa mengubah status fase di proyek yang bukan miliknya", async () => {
    const phase = await createPhaseForUser(admin, {
      projectId: otherProjectId,
      name: "Bukan punyamu",
      weight: 1,
    });
    await expect(
      setPhaseStatusForUser(surveyor, { phaseId: phase.id, status: "selesai" }),
    ).rejects.toThrow();
  });

  it("klien tidak bisa mengubah status fase", async () => {
    const phase = await createPhaseForUser(admin, { projectId, name: "F1", weight: 1 });
    await expect(
      setPhaseStatusForUser(clientUser, { phaseId: phase.id, status: "selesai" }),
    ).rejects.toThrow();
  });
});

describe("invarian progres & urutan", () => {
  it("progres diturunkan dari bobot fase yang selesai", async () => {
    await createPhaseForUser(admin, { projectId, name: "A", weight: 3 });
    const b = await createPhaseForUser(admin, { projectId, name: "B", weight: 1 });
    const c = await createPhaseForUser(admin, { projectId, name: "C", weight: 1 });

    await setPhaseStatusForUser(admin, { phaseId: b.id, status: "selesai" });
    await setPhaseStatusForUser(admin, { phaseId: c.id, status: "selesai" });

    expect(await getProjectProgress(admin, projectId)).toBe(40); // 2 / 5
  });

  it("proyek tanpa fase -> progres null, bukan 0", async () => {
    expect(await getProjectProgress(admin, otherProjectId)).toBeNull();
  });

  it("memundurkan status dari selesai mengosongkan completedAt", async () => {
    const phase = await createPhaseForUser(admin, { projectId, name: "A", weight: 1 });
    await setPhaseStatusForUser(admin, { phaseId: phase.id, status: "selesai" });
    const back = await setPhaseStatusForUser(admin, { phaseId: phase.id, status: "berjalan" });
    expect(back.completedAt).toBeNull();
  });

  it("fase baru masuk di urutan terakhir", async () => {
    const a = await createPhaseForUser(admin, { projectId, name: "A", weight: 1 });
    const b = await createPhaseForUser(admin, { projectId, name: "B", weight: 1 });
    expect(b.sortOrder).toBeGreaterThan(a.sortOrder);
  });

  it("susun ulang menulis ulang seluruh urutan, tanpa kembar", async () => {
    const a = await createPhaseForUser(admin, { projectId, name: "A", weight: 1 });
    const b = await createPhaseForUser(admin, { projectId, name: "B", weight: 1 });
    const c = await createPhaseForUser(admin, { projectId, name: "C", weight: 1 });

    const rows = await reorderPhasesForUser(admin, {
      projectId,
      orderedPhaseIds: [c.id, a.id, b.id],
    });

    expect(rows.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
    expect(rows.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });

  it("susun ulang menolak daftar id yang tidak lengkap", async () => {
    const a = await createPhaseForUser(admin, { projectId, name: "A", weight: 1 });
    await createPhaseForUser(admin, { projectId, name: "B", weight: 1 });
    await expect(
      reorderPhasesForUser(admin, { projectId, orderedPhaseIds: [a.id] }),
    ).rejects.toThrow(/lengkap/i);
  });
});
```

Catatan: tiap `it` harus mulai dari kondisi bersih — tambahkan `beforeEach` yang `await db.delete(projectPhases).where(eq(projectPhases.projectId, projectId))` (dan untuk `otherProjectId`).

- [ ] **Step 3: Jalankan, pastikan GAGAL**

Run: `pnpm test lib/actions/phases.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/phases-logic"`.

- [ ] **Step 4: Implementasi `lib/actions/phases-logic.ts`**

```ts
import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CreatePhaseInput,
  DeletePhaseInput,
  ReorderPhasesInput,
  SetPhaseStatusInput,
  UpdatePhaseInput,
  UpdatePhaseNoteInput,
} from "@/lib/actions/phases-schemas";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projectPhases } from "@/lib/db/schema";
import { calculateProgress, completedAtFor, nextSortOrder, resequence } from "@/lib/phases/derive";

/**
 * Timeline fase (spec 2026-07-14). Logika + guard dipisah dari pembungkus
 * "use server" di `phases.ts` supaya bisa diuji langsung (`phases.test.ts`),
 * pola yang sama dengan `payments-logic.ts`.
 *
 * PEMBAGIAN HAK: admin memegang RENCANA (buat/hapus/susun/bobot/target),
 * surveyor melaporkan PEKERJAAN (status + catatan). Kalau surveyor bisa
 * menyusun ulang atau mengubah bobot, persen progres berhenti berarti apa pun —
 * orang yang dinilai olehnya juga yang menyusunnya.
 */

export type PhaseRow = typeof projectPhases.$inferSelect;

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Hanya admin yang bisa mengelola fase proyek.");
  }
}

/** Sama seperti `payments-logic.ts`: ubah sinyal 404 `notFound()` jadi penolakan biasa. */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function assertProjectAccessOrReject(projectId: string, user: SessionUser) {
  try {
    return await assertProjectAccess(projectId, user);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Proyek tidak ditemukan atau kamu tidak punya akses.");
    }
    throw error;
  }
}

/** Ambil fase + pastikan pemanggil boleh menyentuh proyeknya. */
async function loadPhaseWithAccess(phaseId: string, user: SessionUser): Promise<PhaseRow> {
  const [phase] = await db.select().from(projectPhases).where(eq(projectPhases.id, phaseId));
  if (!phase) throw new Error("Fase tidak ditemukan.");
  await assertProjectAccessOrReject(phase.projectId, user);
  return phase;
}

/** Klien BOLEH memanggil ini — pemangkasan field internal terjadi di lapisan portal. */
export async function listPhasesForProject(
  user: SessionUser,
  projectId: string,
): Promise<PhaseRow[]> {
  await assertProjectAccessOrReject(projectId, user);
  return db
    .select()
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sortOrder));
}

export async function getProjectProgress(
  user: SessionUser,
  projectId: string,
): Promise<number | null> {
  const phases = await listPhasesForProject(user, projectId);
  return calculateProgress(phases);
}

export async function createPhaseForUser(
  user: SessionUser,
  input: CreatePhaseInput,
): Promise<PhaseRow> {
  requireAdmin(user);
  await assertProjectAccessOrReject(input.projectId, user);

  const existing = await db
    .select({ sortOrder: projectPhases.sortOrder })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, input.projectId));

  const [row] = await db
    .insert(projectPhases)
    .values({
      projectId: input.projectId,
      name: input.name,
      description: input.description?.length ? input.description : null,
      weight: input.weight,
      assignedSurveyorId: input.assignedSurveyorId ?? null,
      targetDate: input.targetDate ?? null,
      sortOrder: nextSortOrder(existing),
    })
    .returning();

  return row;
}

export async function updatePhaseForUser(
  user: SessionUser,
  input: UpdatePhaseInput,
): Promise<PhaseRow> {
  requireAdmin(user);
  await loadPhaseWithAccess(input.phaseId, user);

  const [row] = await db
    .update(projectPhases)
    .set({
      name: input.name,
      description: input.description?.length ? input.description : null,
      weight: input.weight,
      assignedSurveyorId: input.assignedSurveyorId ?? null,
      targetDate: input.targetDate ?? null,
      updatedAt: new Date(),
    })
    .where(eq(projectPhases.id, input.phaseId))
    .returning();

  return row;
}

/** Admin ATAU surveyor ber-akses. `completedAt` diurus `completedAtFor`, bukan pemanggil. */
export async function setPhaseStatusForUser(
  user: SessionUser,
  input: SetPhaseStatusInput,
): Promise<PhaseRow> {
  const phase = await loadPhaseWithAccess(input.phaseId, user);
  if (user.role === "client") {
    throw new Error("Klien tidak bisa mengubah status fase.");
  }

  const [row] = await db
    .update(projectPhases)
    .set({
      status: input.status,
      completedAt: completedAtFor(input.status, new Date(), phase.completedAt),
      updatedAt: new Date(),
    })
    .where(eq(projectPhases.id, input.phaseId))
    .returning();

  return row;
}

export async function updatePhaseNoteForUser(
  user: SessionUser,
  input: UpdatePhaseNoteInput,
): Promise<PhaseRow> {
  await loadPhaseWithAccess(input.phaseId, user);
  if (user.role === "client") {
    throw new Error("Klien tidak bisa mengubah catatan fase.");
  }

  const [row] = await db
    .update(projectPhases)
    .set({
      description: input.description.length ? input.description : null,
      updatedAt: new Date(),
    })
    .where(eq(projectPhases.id, input.phaseId))
    .returning();

  return row;
}

export async function deletePhaseForUser(
  user: SessionUser,
  input: DeletePhaseInput,
): Promise<{ projectId: string }> {
  requireAdmin(user);
  const phase = await loadPhaseWithAccess(input.phaseId, user);

  await db.delete(projectPhases).where(eq(projectPhases.id, input.phaseId));
  return { projectId: phase.projectId };
}

/**
 * Susun ulang SELURUH fase proyek dalam satu transaksi. `orderedPhaseIds` harus
 * memuat SEMUA fase proyek itu — menerima daftar sebagian akan meninggalkan
 * `sortOrder` kembar di fase yang tidak disebut.
 */
export async function reorderPhasesForUser(
  user: SessionUser,
  input: ReorderPhasesInput,
): Promise<PhaseRow[]> {
  requireAdmin(user);
  await assertProjectAccessOrReject(input.projectId, user);

  const current = await db
    .select({ id: projectPhases.id })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, input.projectId));

  const currentIds = new Set(current.map((p) => p.id));
  const givenIds = new Set(input.orderedPhaseIds);
  const sameSize = currentIds.size === givenIds.size;
  const allKnown = input.orderedPhaseIds.every((id) => currentIds.has(id));
  if (!sameSize || !allKnown) {
    throw new Error("Daftar urutan harus memuat semua fase proyek ini, tepat satu kali.");
  }

  await db.transaction(async (tx) => {
    for (const { id, sortOrder } of resequence(input.orderedPhaseIds)) {
      await tx
        .update(projectPhases)
        .set({ sortOrder, updatedAt: new Date() })
        .where(and(eq(projectPhases.id, id), eq(projectPhases.projectId, input.projectId)));
    }
  });

  return db
    .select()
    .from(projectPhases)
    .where(inArray(projectPhases.id, input.orderedPhaseIds))
    .orderBy(asc(projectPhases.sortOrder));
}
```

- [ ] **Step 5: Jalankan, pastikan LULUS**

Run: `pnpm test lib/actions/phases.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/phases-schemas.ts lib/actions/phases-logic.ts lib/actions/phases.test.ts
git commit -m "feat(fase): logika CRUD fase + guard admin/surveyor"
```

---

### Task 5: Server action

**Files:**
- Create: `lib/actions/phases.ts`

**Interfaces:**
- Consumes: semua `*ForUser` dari Task 4, skema dari Task 4.
- Produces: `createPhase`, `updatePhase`, `setPhaseStatus`, `updatePhaseNote`, `deletePhase`, `reorderPhases` — dipakai komponen di Task 6-7.

- [ ] **Step 1: Tulis actionnya**

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  createPhaseForUser,
  deletePhaseForUser,
  reorderPhasesForUser,
  setPhaseStatusForUser,
  updatePhaseForUser,
  updatePhaseNoteForUser,
} from "@/lib/actions/phases-logic";
import {
  createPhaseInputSchema,
  deletePhaseInputSchema,
  reorderPhasesInputSchema,
  setPhaseStatusInputSchema,
  updatePhaseInputSchema,
  updatePhaseNoteInputSchema,
} from "@/lib/actions/phases-schemas";
import { adminActionClient, staffActionClient } from "@/lib/actions/safe-action";

/**
 * Server action timeline fase. Logika + guard ada di `phases-logic.ts` (diuji
 * langsung); klien di sini adalah lapis PERTAMA penegakan, bukan penggantinya.
 *
 * `adminActionClient` untuk yang mengubah RENCANA; `staffActionClient` untuk
 * yang melaporkan PEKERJAAN (guard row-level-nya tetap di logic layer, yang
 * memastikan surveyor cuma menyentuh proyek yang boleh ia sentuh).
 */

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export const createPhase = adminActionClient
  .inputSchema(createPhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await createPhaseForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const updatePhase = adminActionClient
  .inputSchema(updatePhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await updatePhaseForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const deletePhase = adminActionClient
  .inputSchema(deletePhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = await deletePhaseForUser(ctx.user, parsedInput);
    revalidateProject(projectId);
    return { success: true as const };
  });

export const reorderPhases = adminActionClient
  .inputSchema(reorderPhasesInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phases = await reorderPhasesForUser(ctx.user, parsedInput);
    revalidateProject(parsedInput.projectId);
    return { success: true as const, phases };
  });

export const setPhaseStatus = staffActionClient
  .inputSchema(setPhaseStatusInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await setPhaseStatusForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const updatePhaseNote = staffActionClient
  .inputSchema(updatePhaseNoteInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await updatePhaseNoteForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: keluar tanpa error.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/phases.ts
git commit -m "feat(fase): server action fase proyek"
```

---

### Task 6: Label + tab "Fase" di detail proyek

**Files:**
- Modify: `lib/labels.ts` (tambah `phaseStatusLabel`)
- Create: `components/projects/phase-timeline.tsx` (server-safe, dipakai dashboard & portal)
- Create: `components/projects/phase-card.tsx` (client — ubah status & catatan)
- Create: `components/projects/phase-form-dialog.tsx` (client — admin: tambah/edit)
- Create: `components/projects/phase-reorder-buttons.tsx` (client — admin: naik/turun)
- Modify: `app/dashboard/projects/[id]/page.tsx:158-165` (tab list) dan tambah `TabsContent value="fase"`

**Interfaces:**
- Consumes: `listPhasesForProject`, `getProjectProgress` (Task 4); action dari Task 5; `isPhaseLate` (Task 2).
- Produces: `<PhaseTimeline phases={...} progress={...} canEditPlan={...} canReportWork={...} surveyors={...} projectId={...} />` — `canEditPlan` = admin, `canReportWork` = admin|surveyor. Portal memakai komponen yang sama dengan kedua flag `false`.

- [ ] **Step 1: Label**

Di `lib/labels.ts` tambahkan:

```ts
export const phaseStatusLabel: Record<string, string> = {
  belum: "Belum Mulai",
  berjalan: "Berjalan",
  selesai: "Selesai",
};
```

- [ ] **Step 2: Timeline**

`components/projects/phase-timeline.tsx` — kartu per fase urut `sortOrder`, progress bar di atas ("3 dari 5 fase selesai · 60%"). Aturan yang WAJIB dipatuhi:

- `progress === null` → jangan render "0%". Render empty state: admin dapat ajakan "Tambah fase pertama", surveyor/klien dapat "Belum ada fase".
- Fase telat (`isPhaseLate(phase, todayString)`) diberi penanda merah "Telat". `todayString` dihitung di komponen server dan **di-pass** ke `isPhaseLate` — jangan panggil `new Date()` di dalam fungsi murni itu.
- `canEditPlan === false` → tombol tambah/edit/hapus/susun **tidak dirender**. Ini kenyamanan, bukan keamanan: penolakan sungguhannya ada di `phases-logic.ts`.
- Props `description` hanya dirender kalau ada; untuk klien nilainya memang tidak pernah sampai (lihat Task 7).

- [ ] **Step 3: Kartu fase (client)**

`components/projects/phase-card.tsx` — memakai `useAction(setPhaseStatus)` dan `useAction(updatePhaseNote)`, pola sama dengan `components/payments/record-payment-dialog.tsx` (`useAction` + `executeAsync`, error ditaruh di state lokal). Dropdown status memakai `SelectField` + `optionsFromLabels(phaseStatusLabel)` dari `components/ui/select-field`.

- [ ] **Step 4: Form fase (client, admin)**

`components/projects/phase-form-dialog.tsx` — `react-hook-form` + `useAction(createPhase | updatePhase)`. Field: nama, deskripsi (`Textarea`), bobot (`Input type=number`, default 1), penanggung jawab (`SelectField` dari daftar surveyor yang di-pass dari server), target (`Input type=date`, boleh kosong).

- [ ] **Step 5: Susun ulang (client, admin)**

`components/projects/phase-reorder-buttons.tsx` — tombol naik/turun per fase. Menghitung urutan baru **lengkap** lalu memanggil `reorderPhases({ projectId, orderedPhaseIds })`. Jangan kirim daftar sebagian — server menolaknya.

- [ ] **Step 6: Pasang tab di `app/dashboard/projects/[id]/page.tsx`**

Di halaman (Server Component), setelah `const isAdmin = user.role === "admin";`:

```tsx
const phases = await listPhasesForProject(user, project.id);
const progress = calculateProgress(phases);
// Daftar surveyor untuk dropdown penanggung jawab — hanya admin yang butuh.
// Query inline, pola yang sama dengan `app/dashboard/projects/new/page.tsx:18`.
// BEDANYA: kita saring `archivedAt` — menugaskan fase ke surveyor yang sudah
// diarsipkan berarti menugaskannya ke orang yang tidak bisa login.
const surveyors = isAdmin
  ? await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
  : [];
```

Tambahkan trigger setelah `<TabsTrigger value="overview">`:

```tsx
<TabsTrigger value="fase">Fase</TabsTrigger>
```

dan konten:

```tsx
<TabsContent value="fase" className="pt-4">
  <PhaseTimeline
    projectId={project.id}
    phases={phases}
    progress={progress}
    today={todayString(new Date())}
    canEditPlan={isAdmin}
    canReportWork={user.role === "admin" || user.role === "surveyor"}
    surveyors={surveyors}
  />
</TabsContent>
```

- [ ] **Step 7: Verifikasi di browser**

Run: `pnpm dev`, buka `/dashboard/projects/<id>` sebagai admin (kredensial seed ada di `lib/db/seed.ts`).
Expected: tab "Fase" ada; tambah 3 fase; tandai 1 selesai; progress bar menunjukkan 33%; proyek yang belum punya fase menampilkan empty state, **bukan** "0%".

- [ ] **Step 8: Lint + typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: bersih.

- [ ] **Step 9: Commit**

```bash
git add lib/labels.ts components/projects/ app/dashboard/projects/
git commit -m "feat(fase): tab Fase di detail proyek (timeline + kelola)"
```

---

### Task 7: Portal klien — timeline read-only

**Files:**
- Create: `lib/actions/portal-phases.ts` **atau** tambahkan fungsi ke `lib/actions/portal-logic.ts` (ikuti yang ada di sana)
- Modify: `app/portal/projects/[id]/page.tsx`
- Test: `lib/actions/portal.test.ts` (tambahkan)

**Interfaces:**
- Consumes: `listPhasesForProject` (Task 4), `calculateProgress` (Task 2), `PhaseTimeline` (Task 6).
- Produces: `listPortalPhases(user, projectId): Promise<PortalPhase[]>` di mana
  `type PortalPhase = { id: string; name: string; status: PhaseStatus; sortOrder: number; targetDate: string | null; completedAt: Date | null }`
  — **tanpa** `description`, **tanpa** `weight`, **tanpa** `assignedSurveyorId`.

- [ ] **Step 1: Tulis test yang gagal**

Di `lib/actions/portal.test.ts`:

```ts
it("baris fase yang sampai ke klien TIDAK memuat catatan internal, bobot, maupun penanggung jawab", async () => {
  await db.insert(projectPhases).values({
    projectId,
    name: "Olah data",
    sortOrder: 0,
    weight: 5,
    description: "RAHASIA INTERNAL",
    assignedSurveyorId: surveyor.id,
  });

  const rows = await listPortalPhases(clientUser, projectId);

  expect(rows).toHaveLength(1);
  expect(rows[0].name).toBe("Olah data");
  // Dikunci pada BENTUK hasil query, bukan pada render — UI bukan batas keamanan.
  expect(rows[0]).not.toHaveProperty("description");
  expect(rows[0]).not.toHaveProperty("weight");
  expect(rows[0]).not.toHaveProperty("assignedSurveyorId");
  expect(JSON.stringify(rows)).not.toContain("RAHASIA INTERNAL");
});

it("klien tidak bisa membaca fase proyek klien lain", async () => {
  await expect(listPortalPhases(otherClientUser, projectId)).rejects.toThrow();
});
```

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `pnpm test lib/actions/portal.test.ts`
Expected: FAIL — `listPortalPhases` belum ada.

- [ ] **Step 3: Implementasi**

```ts
export type PortalPhase = {
  id: string;
  name: string;
  status: "belum" | "berjalan" | "selesai";
  sortOrder: number;
  targetDate: string | null;
  completedAt: Date | null;
};

/**
 * Fase seperti yang dilihat KLIEN. `description` (catatan internal), `weight`,
 * dan `assignedSurveyorId` dipangkas DI SINI, di level query — bukan di render.
 * Portal klien saat ini tidak menampilkan nama surveyor di mana pun, dan fitur
 * ini bukan tempat untuk diam-diam mengubah itu.
 */
export async function listPortalPhases(
  user: SessionUser,
  projectId: string,
): Promise<PortalPhase[]> {
  await assertProjectAccess(projectId, user);

  return db
    .select({
      id: projectPhases.id,
      name: projectPhases.name,
      status: projectPhases.status,
      sortOrder: projectPhases.sortOrder,
      targetDate: projectPhases.targetDate,
      completedAt: projectPhases.completedAt,
    })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId))
    .orderBy(asc(projectPhases.sortOrder));
}
```

Untuk progres portal: hitung dari fase **lengkap** di server (`calculateProgress` butuh `weight`), lalu kirim hanya angkanya:

```ts
export async function getPortalProgress(user: SessionUser, projectId: string) {
  await assertProjectAccess(projectId, user);
  const rows = await db
    .select({ status: projectPhases.status, weight: projectPhases.weight })
    .from(projectPhases)
    .where(eq(projectPhases.projectId, projectId));
  return calculateProgress(rows);
}
```

- [ ] **Step 4: Jalankan, pastikan LULUS**

Run: `pnpm test lib/actions/portal.test.ts`
Expected: PASS.

- [ ] **Step 5: Pasang di `app/portal/projects/[id]/page.tsx`**

Render `<PhaseTimeline>` dengan `canEditPlan={false} canReportWork={false}`. **Kalau `phases.length === 0`, jangan render bagian ini sama sekali** — timeline kosong terlihat seperti proyek yang tidak dikerjakan.

- [ ] **Step 6: Verifikasi di browser**

Run: `pnpm dev`, login sebagai klien seed, buka proyeknya.
Expected: timeline muncul dengan persen progres; tidak ada tombol apa pun; catatan internal tidak terlihat (cek juga **view-source** — kalau catatan muncul di HTML, pemangkasan query-nya bocor).

- [ ] **Step 7: Commit**

```bash
git add lib/actions/ app/portal/
git commit -m "feat(fase): timeline read-only di portal klien"
```

---

### Task 8: Seed, e2e, dokumentasi

**Files:**
- Modify: `lib/db/seed.ts`
- Create: `e2e/project-phases.spec.ts`
- Modify: `tasks.md`, `PRD.md`

- [ ] **Step 1: Seed**

Tambahkan 3 fase ke salah satu proyek demo (satu `selesai`, satu `berjalan`, satu `belum`; satu di antaranya `targetDate` yang sudah lewat supaya penanda "Telat" kelihatan di demo). Sisipkan `db.delete(projectPhases)` di urutan pembersihan seed **sebelum** `projects`.

Run: `pnpm db:seed`
Expected: selesai tanpa error.

- [ ] **Step 2: E2E**

`e2e/project-phases.spec.ts` — ikuti pola `e2e/client-portal.spec.ts` yang sudah ada. Alur: admin login → buka proyek → tab Fase → tambah 3 fase → tandai 1 selesai → logout → login sebagai klien → buka proyek → **assert** persen progres terlihat dan nama fase terlihat, catatan internal **tidak** ada di halaman.

Run: `pnpm e2e e2e/project-phases.spec.ts`
Expected: PASS.

- [ ] **Step 3: Dokumentasi**

`tasks.md`: tambahkan bagian "Phase 13 — Timeline fase proyek" dengan poin-poin apa yang dibangun + keputusan yang load-bearing (progres turunan; fase memberi akses proyek; klien tidak melihat catatan internal). `PRD.md`: tambahkan Feature baru di §3 dengan acceptance criteria yang sudah tercentang.

- [ ] **Step 4: Seluruh test + lint + typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: semua hijau. Kalau ada test lama yang jeblok karena perubahan guard di Task 3, **jangan** ubah assertion-nya tanpa memahami kenapa — itu justru sinyal yang kita pasang.

- [ ] **Step 5: Commit**

```bash
git add lib/db/seed.ts e2e/project-phases.spec.ts tasks.md PRD.md
git commit -m "docs(fase): seed, e2e, dan catatan Phase 13"
```
