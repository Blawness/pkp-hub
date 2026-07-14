# Inventaris Alat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD alat ukur (satu baris = satu unit fisik) dengan pinjam/kembalikan yang menghasilkan status pakai realtime dan durasi terhitung, tiap sesi menunjuk satu proyek.

**Architecture:** Dua tabel baru: `equipment` (aset, soft delete) dan `equipment_usage` (sesi pakai, `endedAt` null = sedang dipakai). Sesi ganda dicegah **partial unique index** di database. Fungsi murni di `lib/equipment/derive.ts`; logika ber-guard + DB di `lib/actions/equipment-logic.ts`; server action tipis di `lib/actions/equipment.ts`.

**Tech Stack:** Next.js App Router (RSC), Drizzle ORM + Postgres (Neon), next-safe-action, zod, react-hook-form, Vitest (DB dev sungguhan), Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-inventaris-alat-design.md`

**Ketergantungan:** Tidak ada terhadap plan timeline fase. Boleh dikerjakan sebelum, sesudah, atau paralel. (Satu-satunya persinggungan: keduanya memakai `assertProjectAccess`. Kalau plan fase sudah mendarat, surveyor yang di-assign ke sebuah fase juga otomatis boleh mencatat pemakaian alat di proyek itu — perilaku yang diinginkan, tanpa kode tambahan di sini.)

## Global Constraints

- **Pola berkas repo** (ikuti, jangan karang sendiri): fungsi **murni** → `lib/<domain>/derive.ts` + `derive.test.ts` (tanpa fixture, tanpa DB). Logika **ber-guard + DB** → `lib/actions/<domain>-logic.ts`, diuji `lib/actions/<domain>.test.ts` lawan DB dev sungguhan. Skema zod → `lib/actions/<domain>-schemas.ts`. Server action `"use server"` → `lib/actions/<domain>.ts`, tipis, **selalu** memakai klien dari `lib/actions/safe-action.ts`.
- **Guard adalah satu-satunya batas.** Pemilihan proyek untuk sesi pakai WAJIB lewat `assertProjectAccess`.
- **UI bukan batas keamanan.** `purchasePrice` & `purchaseDate` dipangkas **di level query** untuk non-admin — pola `projectValue` di `app/dashboard/projects/[id]/page.tsx`.
- **Klien tidak punya permukaan apa pun ke modul ini.** Tidak ada rute di bawah `/portal`, dan tidak ada query inventaris yang dipanggil dari sana.
- **Bahasa UI: Indonesia.** Label enum lewat `lib/labels.ts`.
- **Perintah:** test `pnpm test`, satu berkas `pnpm test lib/equipment/derive.test.ts`. Typecheck `pnpm typecheck`. Lint `pnpm lint`. Migrasi `pnpm db:generate` lalu `pnpm db:migrate`. E2E `pnpm e2e`.
- **Enum `equipment_category`:** `total_station` | `gps_rtk` | `drone` | `waterpass` | `theodolite` | `lainnya`. **Enum `equipment_condition`:** `tersedia` | `perawatan` | `rusak` | `pensiun`.
- **Durasi & status pakai TIDAK disimpan sebagai kolom** — keduanya turunan. Menyimpannya berarti mengoreksi jam mulai akan meninggalkan durasi lama yang sudah jadi bohong.
- Commit tiap akhir task. Pesan commit Indonesia, prefix conventional.

---

### Task 1: Skema `equipment` + `equipment_usage` + migrasi

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/migrations/<generated>.sql`

**Interfaces:**
- Produces: `equipment`, `equipmentUsage` (tabel drizzle), enum `equipmentCategory` & `equipmentCondition`, index unik parsial `equipment_active_usage_uniq`.

- [ ] **Step 1: Enum + tabel di `lib/db/schema.ts`**

Tambahkan ke blok enum:

```ts
export const equipmentCategory = pgEnum("equipment_category", [
  "total_station",
  "gps_rtk",
  "drone",
  "waterpass",
  "theodolite",
  "lainnya",
]);
export const equipmentCondition = pgEnum("equipment_condition", [
  "tersedia",
  "perawatan",
  "rusak",
  "pensiun",
]);
```

Tambahkan tabel di akhir berkas (setelah `payments`):

```ts
/**
 * Inventaris alat (spec 2026-07-14). SATU BARIS = SATU UNIT FISIK — dua total
 * station sejenis adalah dua baris. Hanya dengan begitu sistem bisa menjamin
 * satu alat dipegang satu orang, dan riwayat pakai menempel ke unit yang benar.
 *
 * Alat TIDAK PERNAH dihapus permanen, hanya diarsipkan (`archivedAt`): baris
 * `equipment_usage` menunjuk ke sini lewat FK, jadi DELETE akan gagal — atau,
 * kalau dipaksa cascade, ikut menghapus jejak siapa pernah memegang apa.
 * Alasan yang sama dengan `users.archivedAt`.
 *
 * `condition` TERPISAH dari status pinjam. Alat rusak bukan "sedang dipakai"
 * dan bukan "tersedia"; tanpa kolom ini, satu-satunya cara menandainya adalah
 * menghapusnya.
 */
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: equipmentCategory("category").notNull(),
    serialNumber: text("serial_number"),
    condition: equipmentCondition("condition").notNull().default("tersedia"),
    // ADMIN-ONLY. Dipangkas di level query untuk surveyor (equipment-logic.ts).
    purchaseDate: date("purchase_date", { mode: "string" }),
    purchasePrice: bigint("purchase_price", { mode: "number" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipment_condition_idx").on(t.condition),
    index("equipment_archived_at_idx").on(t.archivedAt),
  ],
);

/**
 * Sesi pakai. `endedAt` NULL = SEDANG DIPAKAI — status pakai adalah turunan dari
 * adanya sesi terbuka, bukan dropdown terpisah (pelajaran `paymentStatus`
 * Phase 12). Durasi juga tidak disimpan: ia `endedAt − startedAt`, supaya
 * mengoreksi jam mulai tidak meninggalkan durasi lama yang sudah jadi bohong.
 *
 * `usedById` (yang MEMEGANG) sengaja dipisah dari `recordedById` (yang
 * MENGINPUT): admin sering mencatat dari kantor untuk surveyor di lapangan.
 * Menggabungkannya membuat riwayat mencatat admin sebagai pemegang alat yang
 * tidak pernah ia sentuh.
 */
export const equipmentUsage = pgTable(
  "equipment_usage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    usedById: text("used_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    note: text("note"),
    recordedById: text("recorded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipment_usage_equipment_id_idx").on(t.equipmentId),
    index("equipment_usage_project_id_idx").on(t.projectId),
    /**
     * PERTAHANAN SUNGGUHAN terhadap sesi ganda. Kalau hanya dicek di kode
     * ("apakah ada sesi terbuka?" lalu insert), dua surveyor yang menekan
     * "Pakai" hampir bersamaan bisa DUA-DUANYA lolos pengecekan sebelum salah
     * satunya menulis — dan alat tercatat di dua tangan. Pengecekan di kode
     * hanya untuk memberi pesan error yang enak dibaca; INI yang menegakkan.
     */
    uniqueIndex("equipment_active_usage_uniq")
      .on(t.equipmentId)
      .where(sql`${t.endedAt} is null`),
  ],
);

export const equipmentRelations = relations(equipment, ({ many }) => ({
  usages: many(equipmentUsage),
}));

export const equipmentUsageRelations = relations(equipmentUsage, ({ one }) => ({
  equipment: one(equipment, {
    fields: [equipmentUsage.equipmentId],
    references: [equipment.id],
  }),
  project: one(projects, { fields: [equipmentUsage.projectId], references: [projects.id] }),
  usedBy: one(users, { fields: [equipmentUsage.usedById], references: [users.id] }),
  recordedBy: one(users, { fields: [equipmentUsage.recordedById], references: [users.id] }),
}));
```

Tambahkan `uniqueIndex` dan `sql` ke import di bagian atas berkas (`drizzle-orm/pg-core` dan `drizzle-orm`).

- [ ] **Step 2: Generate migrasi**

Run: `pnpm db:generate`
Expected: SQL baru memuat `CREATE TABLE "equipment"`, `CREATE TABLE "equipment_usage"`, dan — **wajib diperiksa dengan mata** — baris:

```sql
CREATE UNIQUE INDEX "equipment_active_usage_uniq" ON "equipment_usage" USING btree ("equipment_id") WHERE "equipment_usage"."ended_at" is null;
```

Kalau klausa `WHERE`-nya tidak ada, index-nya salah (akan melarang alat dipinjam **dua kali seumur hidup**, bukan dua kali bersamaan). Perbaiki SQL-nya dengan tangan sebelum lanjut.

- [ ] **Step 3: Terapkan**

Run: `pnpm db:migrate`
Expected: `[✓] migrations applied successfully!`

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm typecheck`

```bash
git add lib/db/schema.ts drizzle/migrations/
git commit -m "feat(inventaris): tabel equipment & equipment_usage + kunci sesi aktif"
```

---

### Task 2: Fungsi murni — durasi, kelayakan pinjam, validasi waktu

**Files:**
- Create: `lib/equipment/derive.ts`
- Test: `lib/equipment/derive.test.ts`

**Interfaces:**
- Produces:
  - `type EquipmentCondition = "tersedia" | "perawatan" | "rusak" | "pensiun"`
  - `usageDurationMs(session: { startedAt: Date; endedAt: Date | null }, now: Date): number` — `now` **di-inject**, jangan `Date.now()` di dalam (test jadi flaky).
  - `formatDuration(ms: number): string` — "3 jam 20 menit", "2 hari 4 jam", "45 menit".
  - `borrowRejection(equipment: { condition: EquipmentCondition; archivedAt: Date | null }, hasActiveSession: boolean): string | null` — pesan penolakan, atau `null` kalau boleh dipinjam.
  - `validateUsageWindow(startedAt: Date, endedAt: Date | null, now: Date): string | null` — pesan penolakan, atau `null`.

- [ ] **Step 1: Tulis test yang gagal**

`lib/equipment/derive.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  borrowRejection,
  formatDuration,
  usageDurationMs,
  validateUsageWindow,
} from "@/lib/equipment/derive";

const now = new Date("2026-07-14T12:00:00Z");

describe("usageDurationMs", () => {
  it("sesi tertutup -> selisih mulai dan selesai", () => {
    expect(
      usageDurationMs(
        { startedAt: new Date("2026-07-14T08:00:00Z"), endedAt: new Date("2026-07-14T11:00:00Z") },
        now,
      ),
    ).toBe(3 * 60 * 60 * 1000);
  });

  // Sesi berjalan dihitung sampai `now` yang DI-INJECT — bukan Date.now(),
  // supaya test tidak flaky dan hasilnya bisa ditegaskan persis.
  it("sesi berjalan -> dihitung sampai now", () => {
    expect(
      usageDurationMs({ startedAt: new Date("2026-07-14T09:00:00Z"), endedAt: null }, now),
    ).toBe(3 * 60 * 60 * 1000);
  });
});

describe("formatDuration", () => {
  it("menit saja", () => {
    expect(formatDuration(45 * 60 * 1000)).toBe("45 menit");
  });

  it("jam dan menit", () => {
    expect(formatDuration(3 * 60 * 60 * 1000 + 20 * 60 * 1000)).toBe("3 jam 20 menit");
  });

  it("hari dan jam", () => {
    expect(formatDuration(2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000)).toBe("2 hari 4 jam");
  });
});

describe("borrowRejection", () => {
  const ok = { condition: "tersedia" as const, archivedAt: null };

  it("alat tersedia dan bebas -> boleh", () => {
    expect(borrowRejection(ok, false)).toBeNull();
  });

  it("alat sedang dipakai -> ditolak", () => {
    expect(borrowRejection(ok, true)).toMatch(/sedang dipakai/i);
  });

  // Satu kasus per kondisi: alat yang tidak `tersedia` TIDAK BOLEH dipinjam.
  it("alat dalam perawatan -> ditolak", () => {
    expect(borrowRejection({ condition: "perawatan", archivedAt: null }, false)).toMatch(
      /perawatan/i,
    );
  });

  it("alat rusak -> ditolak", () => {
    expect(borrowRejection({ condition: "rusak", archivedAt: null }, false)).toMatch(/rusak/i);
  });

  it("alat pensiun -> ditolak", () => {
    expect(borrowRejection({ condition: "pensiun", archivedAt: null }, false)).toMatch(/pensiun/i);
  });

  it("alat terarsip -> ditolak", () => {
    expect(borrowRejection({ condition: "tersedia", archivedAt: new Date() }, false)).toMatch(
      /arsip/i,
    );
  });
});

describe("validateUsageWindow", () => {
  it("mulai di masa lalu -> boleh (untuk yang lupa menekan tombol)", () => {
    expect(validateUsageWindow(new Date("2026-07-14T08:00:00Z"), null, now)).toBeNull();
  });

  // Mencatat pemakaian yang BELUM terjadi adalah booking, dan booking bukan
  // cakupan modul ini (spec §Ruang lingkup).
  it("mulai di masa depan -> ditolak", () => {
    expect(validateUsageWindow(new Date("2026-07-15T08:00:00Z"), null, now)).toMatch(
      /masa depan/i,
    );
  });

  it("selesai sebelum mulai -> ditolak", () => {
    expect(
      validateUsageWindow(
        new Date("2026-07-14T10:00:00Z"),
        new Date("2026-07-14T09:00:00Z"),
        now,
      ),
    ).toMatch(/setelah/i);
  });

  it("selesai sama dengan mulai -> ditolak", () => {
    const t = new Date("2026-07-14T10:00:00Z");
    expect(validateUsageWindow(t, t, now)).toMatch(/setelah/i);
  });
});
```

- [ ] **Step 2: Jalankan, pastikan GAGAL**

Run: `pnpm test lib/equipment/derive.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/equipment/derive"`.

- [ ] **Step 3: Implementasi `lib/equipment/derive.ts`**

```ts
/**
 * Fungsi murni di balik inventaris alat (spec 2026-07-14). Tidak menyentuh DB —
 * aturan pinjamnya bisa diuji tanpa fixture apa pun.
 */

export type EquipmentCondition = "tersedia" | "perawatan" | "rusak" | "pensiun";

const conditionRejection: Record<Exclude<EquipmentCondition, "tersedia">, string> = {
  perawatan: "Alat sedang dalam perawatan.",
  rusak: "Alat berstatus rusak.",
  pensiun: "Alat sudah dipensiunkan.",
};

/** `now` di-inject — jangan panggil `Date.now()` di sini, test jadi flaky. */
export function usageDurationMs(
  session: { startedAt: Date; endedAt: Date | null },
  now: Date,
): number {
  const end = session.endedAt ?? now;
  return end.getTime() - session.startedAt.getTime();
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

/**
 * Boleh dipinjam? Mengembalikan PESAN penolakan, atau null kalau boleh.
 *
 * `hasActiveSession` datang dari DB, tapi keputusannya di sini supaya bisa diuji
 * murni. Ingat: pertahanan sungguhan terhadap sesi ganda adalah partial unique
 * index di `equipment_usage` — fungsi ini hanya memberi pesan yang enak dibaca
 * sebelum database sempat menolak.
 */
export function borrowRejection(
  item: { condition: EquipmentCondition; archivedAt: Date | null },
  hasActiveSession: boolean,
): string | null {
  if (item.archivedAt) return "Alat sudah diarsipkan.";
  if (item.condition !== "tersedia") return conditionRejection[item.condition];
  if (hasActiveSession) return "Alat sedang dipakai orang lain.";
  return null;
}

/** Mengembalikan PESAN penolakan, atau null kalau jendela waktunya sah. */
export function validateUsageWindow(
  startedAt: Date,
  endedAt: Date | null,
  now: Date,
): string | null {
  // Mundur BOLEH (untuk yang lupa menekan tombol); maju TIDAK — itu booking,
  // dan booking bukan cakupan modul ini.
  if (startedAt.getTime() > now.getTime()) {
    return "Waktu mulai tidak boleh di masa depan.";
  }
  if (endedAt && endedAt.getTime() <= startedAt.getTime()) {
    return "Waktu selesai harus setelah waktu mulai.";
  }
  return null;
}
```

- [ ] **Step 4: Jalankan, pastikan LULUS**

Run: `pnpm test lib/equipment/derive.test.ts`
Expected: PASS, 15 test.

- [ ] **Step 5: Commit**

```bash
git add lib/equipment/
git commit -m "feat(inventaris): fungsi murni durasi, kelayakan pinjam, validasi waktu"
```

---

### Task 3: Skema input + logika ber-guard

**Files:**
- Create: `lib/actions/equipment-schemas.ts`
- Create: `lib/actions/equipment-logic.ts`
- Test: `lib/actions/equipment.test.ts`

**Interfaces:**
- Consumes: `borrowRejection`, `validateUsageWindow`, `usageDurationMs` (Task 2); `assertProjectAccess` (`lib/auth-guards.ts`).
- Produces:
  - `type EquipmentRow` — baris alat **untuk admin** (dengan `purchasePrice`, `purchaseDate`)
  - `type EquipmentRowSafe` — baris alat **untuk surveyor** (TANPA dua field itu)
  - `type EquipmentListItem = (EquipmentRow | EquipmentRowSafe) & { activeUsage: ActiveUsage | null }`
  - `type ActiveUsage = { usageId: string; usedById: string; usedByName: string; projectId: string; projectTitle: string; startedAt: Date }`
  - `listEquipmentForUser(user): Promise<EquipmentListItem[]>`
  - `getEquipmentForUser(user, equipmentId): Promise<EquipmentListItem>`
  - `listUsageForEquipment(user, equipmentId): Promise<UsageRow[]>`
  - `listUsageForProject(user, projectId): Promise<UsageRow[]>`
  - `createEquipmentForUser(user, input)`, `updateEquipmentForUser(user, input)`, `archiveEquipmentForUser(user, input)` — admin-only
  - `borrowEquipmentForUser(user, input): Promise<UsageRow>`
  - `returnEquipmentForUser(user, input): Promise<UsageRow>`
  - `correctUsageForUser(user, input): Promise<UsageRow>` — admin-only

- [ ] **Step 1: `lib/actions/equipment-schemas.ts`**

```ts
import { z } from "zod";

/** Skema input inventaris alat. Dipisah dari logika (server-only) — komponen klien boleh mengimpor ini. */

export const equipmentCategorySchema = z.enum([
  "total_station",
  "gps_rtk",
  "drone",
  "waterpass",
  "theodolite",
  "lainnya",
]);
export type EquipmentCategoryInput = z.infer<typeof equipmentCategorySchema>;

export const equipmentConditionSchema = z.enum(["tersedia", "perawatan", "rusak", "pensiun"]);
export type EquipmentConditionInput = z.infer<typeof equipmentConditionSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus dalam format YYYY-MM-DD.");

export const createEquipmentInputSchema = z.object({
  name: z.string().trim().min(1, "Nama alat wajib diisi.").max(160),
  category: equipmentCategorySchema,
  serialNumber: z.string().trim().max(120).optional(),
  condition: equipmentConditionSchema.default("tersedia"),
  purchaseDate: dateString.nullable().optional(),
  purchasePrice: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentInputSchema>;

export const updateEquipmentInputSchema = createEquipmentInputSchema.extend({
  equipmentId: z.uuid(),
});
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentInputSchema>;

export const archiveEquipmentInputSchema = z.object({ equipmentId: z.uuid() });
export type ArchiveEquipmentInput = z.infer<typeof archiveEquipmentInputSchema>;

export const borrowEquipmentInputSchema = z.object({
  equipmentId: z.uuid(),
  projectId: z.uuid(),
  // Boleh dimundurkan (lupa menekan tombol), tidak boleh maju — ditegakkan di logic layer.
  startedAt: z.coerce.date(),
  // Admin boleh mengisi ini. Untuk surveyor, server MEMAKSA-nya jadi id dirinya
  // sendiri — bukan sekadar tidak merendernya di form.
  usedById: z.string().min(1).optional(),
  note: z.string().trim().max(500).optional(),
});
export type BorrowEquipmentInput = z.infer<typeof borrowEquipmentInputSchema>;

export const returnEquipmentInputSchema = z.object({
  usageId: z.uuid(),
  endedAt: z.coerce.date().optional(),
  note: z.string().trim().max(500).optional(),
});
export type ReturnEquipmentInput = z.infer<typeof returnEquipmentInputSchema>;

export const correctUsageInputSchema = z.object({
  usageId: z.uuid(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().nullable(),
  note: z.string().trim().max(500).optional(),
});
export type CorrectUsageInput = z.infer<typeof correctUsageInputSchema>;
```

- [ ] **Step 2: Tulis test yang gagal**

`lib/actions/equipment.test.ts`. Fixture: tiru `beforeAll`/`afterAll` di `lib/actions/payments.test.ts` (admin, surveyor, klien, `projectId` yang di-assign ke surveyor, `otherProjectId` yang tidak). Bersihkan `equipmentUsage` **sebelum** `equipment` dan `projects`.

Test yang WAJIB ada:

```ts
describe("batas akses", () => {
  it("surveyor tidak bisa menambah alat", async () => {
    await expect(
      createEquipmentForUser(surveyor, { name: "Curang", category: "drone", condition: "tersedia" }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengubah kondisi alat", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });
    await expect(
      updateEquipmentForUser(surveyor, {
        equipmentId: item.id,
        name: "TS-1",
        category: "total_station",
        condition: "rusak",
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengarsipkan alat", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });
    await expect(
      archiveEquipmentForUser(surveyor, { equipmentId: item.id }),
    ).rejects.toThrow(/admin/i);
  });

  // Dikunci pada BENTUK hasil query, bukan pada render — UI bukan batas keamanan.
  it("baris alat yang sampai ke surveyor TIDAK memuat harga & tanggal beli", async () => {
    await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
      purchasePrice: 250_000_000,
      purchaseDate: "2025-01-10",
    });

    const rows = await listEquipmentForUser(surveyor);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("purchasePrice");
    expect(rows[0]).not.toHaveProperty("purchaseDate");
    expect(JSON.stringify(rows)).not.toContain("250000000");

    const adminRows = await listEquipmentForUser(admin);
    expect(adminRows[0].purchasePrice).toBe(250_000_000);
  });

  it("surveyor tidak bisa mencatat pemakaian untuk proyek yang bukan miliknya", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });
    await expect(
      borrowEquipmentForUser(surveyor, {
        equipmentId: item.id,
        projectId: otherProjectId,
        startedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  // Server MEMAKSA usedById = dirinya. Kalau ini cuma tidak dirender di form,
  // request yang dirakit tangan bisa mencatat alat di tangan orang lain.
  it("surveyor yang mengisi usedById orang lain tetap tercatat atas namanya sendiri", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });

    const usage = await borrowEquipmentForUser(surveyor, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
      usedById: admin.id, // dicoba
    });

    expect(usage.usedById).toBe(surveyor.id);
    expect(usage.recordedById).toBe(surveyor.id);
  });

  it("admin BOLEH mencatat atas nama surveyor", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });

    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    expect(usage.usedById).toBe(surveyor.id);
    expect(usage.recordedById).toBe(admin.id);
  });

  it("klien tidak bisa melihat daftar alat", async () => {
    await expect(listEquipmentForUser(clientUser)).rejects.toThrow();
  });
});

describe("aturan pinjam", () => {
  it("alat rusak tidak bisa dipinjam", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS rusak",
      category: "total_station",
      condition: "rusak",
    });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/rusak/i);
  });

  it("alat terarsip tidak bisa dipinjam", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS arsip",
      category: "total_station",
      condition: "tersedia",
    });
    await archiveEquipmentForUser(admin, { equipmentId: item.id });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/arsip/i);
  });

  it("waktu mulai di masa depan ditolak", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });
    const besok = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: besok }),
    ).rejects.toThrow(/masa depan/i);
  });

  it("meminjam alat yang sudah dipinjam ditolak, dengan menyebut pemegangnya", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });
    await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    await expect(
      borrowEquipmentForUser(admin, { equipmentId: item.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/sedang dipakai/i);
  });

  it("mengembalikan lalu meminjam lagi BOLEH — kuncinya sesi aktif, bukan seumur hidup", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });
    const first = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: first.id });

    const second = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
    });
    expect(second.id).not.toBe(first.id);
  });

  it("status pakai adalah TURUNAN: alat dengan sesi terbuka tampil sedang dipakai, setelah dikembalikan tidak lagi", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: item.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    const dipakai = await getEquipmentForUser(admin, item.id);
    expect(dipakai.activeUsage?.usedById).toBe(surveyor.id);
    expect(dipakai.activeUsage?.projectId).toBe(projectId);

    await returnEquipmentForUser(admin, { usageId: usage.id });

    const bebas = await getEquipmentForUser(admin, item.id);
    expect(bebas.activeUsage).toBeNull();
  });
});

/**
 * INI test yang membuktikan pertahanannya ada di DATABASE, bukan cuma di kode.
 * Ia sengaja MELEWATI logic layer dan menulis langsung ke tabel. Kalau partial
 * unique index-nya dicabut dari skema, test ini berhenti jeblok — dan itulah
 * gunanya.
 */
describe("kunci sesi ganda di level database", () => {
  it("dua sesi terbuka untuk alat yang sama ditolak constraint, walau logic layer dilewati", async () => {
    const item = await createEquipmentForUser(admin, {
      name: "TS-1",
      category: "total_station",
      condition: "tersedia",
    });

    await db.insert(equipmentUsage).values({
      equipmentId: item.id,
      projectId,
      usedById: surveyor.id,
      recordedById: admin.id,
      startedAt: new Date(),
    });

    await expect(
      db.insert(equipmentUsage).values({
        equipmentId: item.id,
        projectId,
        usedById: admin.id,
        recordedById: admin.id,
        startedAt: new Date(),
      }),
    ).rejects.toThrow(/equipment_active_usage_uniq|unique/i);
  });
});
```

- [ ] **Step 3: Jalankan, pastikan GAGAL**

Run: `pnpm test lib/actions/equipment.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/actions/equipment-logic"`.

- [ ] **Step 4: Implementasi `lib/actions/equipment-logic.ts`**

Titik-titik yang tidak boleh meleset:

```ts
import { and, desc, eq, isNull } from "drizzle-orm";
import type {
  ArchiveEquipmentInput,
  BorrowEquipmentInput,
  CorrectUsageInput,
  CreateEquipmentInput,
  ReturnEquipmentInput,
  UpdateEquipmentInput,
} from "@/lib/actions/equipment-schemas";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { equipment, equipmentUsage, projects, users } from "@/lib/db/schema";
import { borrowRejection, validateUsageWindow } from "@/lib/equipment/derive";

/**
 * Inventaris alat (spec 2026-07-14). Logika + guard dipisah dari pembungkus
 * "use server" (`equipment.ts`) supaya bisa diuji langsung — pola
 * `payments-logic.ts`.
 *
 * DUA ATURAN YANG MUDAH DILANGGAR TANPA SADAR:
 *
 * 1. `purchasePrice`/`purchaseDate` TIDAK BOLEH sampai ke surveyor. Karena itu
 *    query untuk non-admin memilih kolom secara eksplisit — jangan sekali-kali
 *    ganti jadi `db.select().from(equipment)`, itu mengirim semuanya.
 * 2. `usedById` untuk surveyor SELALU dipaksa jadi id dirinya di server. Form
 *    yang tidak merender pilihannya bukan penegakan.
 */

function requireStaff(user: SessionUser) {
  if (user.role === "client") {
    throw new Error("Inventaris alat hanya untuk staf studio.");
  }
}

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Hanya admin yang bisa mengelola data alat.");
  }
}
```

- Kolom yang dipilih untuk **admin**: seluruh kolom `equipment`. Untuk **surveyor**: `id, name, category, serialNumber, condition, notes, archivedAt, createdAt, updatedAt` — **tanpa** `purchasePrice`/`purchaseDate`.
- `listEquipmentForUser` / `getEquipmentForUser`: `requireStaff` dulu, lalu join `equipmentUsage` (`isNull(equipmentUsage.endedAt)`) + `users` + `projects` untuk merakit `activeUsage`. Daftar default menyembunyikan alat terarsip.
- `borrowEquipmentForUser`:
  1. `requireStaff(user)`
  2. `await assertProjectAccess(input.projectId, user)` — bungkus dengan penerjemah `notFound()` seperti `payments-logic.ts` (`isNotFoundDigest`).
  3. `const usedById = user.role === "admin" ? (input.usedById ?? user.id) : user.id;` ← **paksa**, jangan percaya input.
  4. Ambil alat; `hasActiveSession` = ada baris `endedAt IS NULL`; `borrowRejection(item, hasActive)` → kalau ada pesan, `throw new Error(pesan)`.
  5. `validateUsageWindow(input.startedAt, null, new Date())` → kalau ada pesan, throw.
  6. Insert. **Jangan** bungkus insert dengan pengecekan yang dianggap cukup — constraint DB adalah penegaknya; tangkap error unik dan terjemahkan jadi "Alat sedang dipakai orang lain."
- `returnEquipmentForUser`: `requireStaff`; ambil sesi; surveyor hanya boleh menutup sesi yang `usedById === user.id`; `endedAt` default `new Date()`; validasi lewat `validateUsageWindow`.
- `correctUsageForUser`: `requireAdmin`; boleh mengubah `startedAt`/`endedAt` sesi yang sudah ditutup; tetap lewat `validateUsageWindow`.
- `listUsageForProject`: `requireStaff` + `assertProjectAccess` — inilah yang membuat surveyor cuma melihat riwayat alat di proyeknya.

- [ ] **Step 5: Jalankan, pastikan LULUS**

Run: `pnpm test lib/actions/equipment.test.ts`
Expected: PASS — termasuk test constraint DB.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/equipment-schemas.ts lib/actions/equipment-logic.ts lib/actions/equipment.test.ts
git commit -m "feat(inventaris): logika alat & sesi pakai + guard peran"
```

---

### Task 4: Server action

**Files:**
- Create: `lib/actions/equipment.ts`

**Interfaces:**
- Produces: `createEquipment`, `updateEquipment`, `archiveEquipment`, `correctUsage` (`adminActionClient`); `borrowEquipment`, `returnEquipment` (`staffActionClient`).

- [ ] **Step 1: Tulis actionnya**

Pola persis `lib/actions/phases.ts` / `lib/actions/payments.ts`: `"use server"`, panggil `*ForUser`, lalu `revalidatePath("/dashboard/equipment")`, `revalidatePath(\`/dashboard/equipment/${id}\`)`, dan `revalidatePath(\`/dashboard/projects/${projectId}\`)` untuk aksi sesi pakai.

`borrowEquipment` dan `returnEquipment` memakai **`staffActionClient`** (surveyor perlu memanggilnya). Sisanya `adminActionClient`. Ingat: klien action ini adalah lapis pertama; row-level guard tetap di `equipment-logic.ts`.

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`

```bash
git add lib/actions/equipment.ts
git commit -m "feat(inventaris): server action alat & sesi pakai"
```

---

### Task 5: Halaman inventaris

**Files:**
- Modify: `lib/labels.ts` (`equipmentCategoryLabel`, `equipmentConditionLabel`)
- Modify: `components/dashboard/nav-config.ts` (menu "Inventaris")
- Create: `app/dashboard/equipment/page.tsx` (daftar), `app/dashboard/equipment/[id]/page.tsx` (detail + riwayat), `app/dashboard/equipment/new/page.tsx`, `app/dashboard/equipment/[id]/edit/page.tsx`
- Create: `components/equipment/equipment-table.tsx`, `equipment-form.tsx`, `usage-history.tsx`, `borrow-dialog.tsx`, `return-button.tsx`

**Interfaces:**
- Consumes: `listEquipmentForUser`, `getEquipmentForUser`, `listUsageForEquipment` (Task 3); action Task 4; `formatDuration`, `usageDurationMs` (Task 2).

- [ ] **Step 1: Label**

```ts
export const equipmentCategoryLabel: Record<string, string> = {
  total_station: "Total Station",
  gps_rtk: "GPS RTK",
  drone: "Drone",
  waterpass: "Waterpass",
  theodolite: "Theodolite",
  lainnya: "Lainnya",
};

export const equipmentConditionLabel: Record<string, string> = {
  tersedia: "Tersedia",
  perawatan: "Perawatan",
  rusak: "Rusak",
  pensiun: "Pensiun",
};
```

- [ ] **Step 2: Navigasi**

Di `components/dashboard/nav-config.ts`, tambahkan ke `links` **sebelum** blok `if (role === "admin")` (jadi surveyor ikut melihatnya):

```ts
{ segment: "equipment", href: "/dashboard/equipment", label: "Inventaris", icon: WrenchIcon },
```

Impor `WrenchIcon` dari `lucide-react`. Catatan yang sudah tertulis di berkas itu tetap berlaku: menyembunyikan tautan bukan pengamanan — penegakannya `requireStaff` di halaman & logic layer.

- [ ] **Step 3: Halaman daftar**

`app/dashboard/equipment/page.tsx` — Server Component. `const user = await requireStaff();` lalu `listEquipmentForUser(user)`. Render `<EquipmentTable rows={...} isAdmin={user.role === "admin"} />`. Kolom harga **hanya** dirender kalau `isAdmin` — dan ingat, untuk surveyor field-nya memang tidak ada di data (Task 3), jadi ini sekadar layout.

Filter kondisi/kategori + "sedang dipakai / tersedia" pakai `@tanstack/react-table` (sudah dipakai di `components/documents/`) atau filter sederhana lewat search param — ikuti yang sudah ada di modul dokumen.

- [ ] **Step 4: Detail + riwayat**

`app/dashboard/equipment/[id]/page.tsx` — identitas alat, kondisi, (admin) data pembelian, lalu `<UsageHistory rows={...} />`: proyek, pemakai, mulai, selesai, **durasi** (`formatDuration(usageDurationMs(row, new Date()))`, dihitung di server), catatan. Sesi berjalan di paling atas dengan durasi berjalan + tombol Kembalikan.

- [ ] **Step 5: Form alat (admin)**

`components/equipment/equipment-form.tsx` — `react-hook-form` + `useAction(createEquipment | updateEquipment)`, pola `components/payments/record-payment-dialog.tsx`. Dipakai oleh `new/page.tsx` dan `[id]/edit/page.tsx`, yang dua-duanya memanggil `requireAdmin()` di server.

- [ ] **Step 6: Verifikasi di browser**

Run: `pnpm dev`
Sebagai **admin**: tambah alat, lihat harga beli di detail.
Sebagai **surveyor**: buka `/dashboard/equipment` → daftar tampil, kolom harga tidak ada. Buka **view-source** halaman detail alat → **assert harga tidak muncul di HTML sama sekali**. Kalau muncul, pemangkasan query di Task 3 bocor — perbaiki di sana, bukan di komponen.

- [ ] **Step 7: Lint + typecheck + commit**

Run: `pnpm lint && pnpm typecheck`

```bash
git add lib/labels.ts components/dashboard/nav-config.ts app/dashboard/equipment/ components/equipment/
git commit -m "feat(inventaris): halaman daftar, detail, dan form alat"
```

---

### Task 6: Tab "Alat" di detail proyek

**Files:**
- Modify: `app/dashboard/projects/[id]/page.tsx`
- Create: `components/equipment/project-equipment.tsx`

**Interfaces:**
- Consumes: `listUsageForProject` (Task 3), `listEquipmentForUser` (untuk daftar alat yang bisa dipinjam), `borrowEquipment` / `returnEquipment` (Task 4).

- [ ] **Step 1: Pasang tab**

Tambahkan `<TabsTrigger value="alat">Alat</TabsTrigger>` (setelah "Dokumen") dan `TabsContent` yang merender `<ProjectEquipment projectId={project.id} usages={...} borrowable={...} canRecord={user.role !== "client"} isAdmin={isAdmin} surveyors={...} />`.

Tab ini **tidak** dirender untuk klien — halaman ini memang hanya dashboard (klien ada di `/portal`), jadi tidak ada perubahan di portal sama sekali.

`borrowable` = alat dengan `condition === "tersedia"`, tidak terarsip, dan `activeUsage === null`. Hitung di server dari `listEquipmentForUser(user)`.

- [ ] **Step 2: Dialog pinjam**

`components/equipment/borrow-dialog.tsx` — field: alat (`SelectField` dari `borrowable`), waktu mulai (`Input type="datetime-local"`, default sekarang), catatan. **Pilihan "dipakai oleh" hanya dirender untuk admin.** Untuk surveyor tidak ada field itu — dan server tetap memaksanya (Task 3), jadi tidak ada yang bergantung pada form.

- [ ] **Step 3: Verifikasi di browser**

Run: `pnpm dev`
Sebagai surveyor: buka proyek yang di-assign → tab Alat → pinjam alat → alat tampil "Dipakai" di `/dashboard/equipment` → kembalikan → durasi muncul di riwayat.
Coba juga: pinjam alat yang sama dari dua tab browser berbarengan → yang kedua harus ditolak dengan pesan yang menyebut pemegangnya.

- [ ] **Step 4: Lint + typecheck + commit**

Run: `pnpm lint && pnpm typecheck`

```bash
git add app/dashboard/projects/ components/equipment/
git commit -m "feat(inventaris): tab Alat di detail proyek"
```

---

### Task 7: Seed, e2e, dokumentasi

**Files:**
- Modify: `lib/db/seed.ts`
- Create: `e2e/equipment.spec.ts`
- Modify: `tasks.md`, `PRD.md`

- [ ] **Step 1: Seed**

Tambahkan 4-5 alat (satu `perawatan`, satu `rusak`, sisanya `tersedia`, dengan harga beli terisi) dan 2 sesi pakai: **satu yang masih berjalan** (supaya status "Dipakai" kelihatan di demo) dan satu yang sudah ditutup. Sisipkan pembersihan `equipmentUsage` lalu `equipment` di urutan seed **sebelum** `projects`/`users`.

Run: `pnpm db:seed`
Expected: selesai tanpa error.

- [ ] **Step 2: E2E**

`e2e/equipment.spec.ts` — admin login → `/dashboard/equipment` → tambah alat → buka proyek → tab Alat → pinjam → **assert** alat berstatus "Dipakai" beserta nama pemegang → kembalikan → **assert** durasi muncul di riwayat.

Run: `pnpm e2e e2e/equipment.spec.ts`
Expected: PASS.

- [ ] **Step 3: Dokumentasi**

`tasks.md`: bagian "Phase 14 — Inventaris alat" dengan keputusan yang load-bearing (satu baris = satu unit; sesi aktif dikunci partial unique index, bukan kode; harga beli dipangkas di query; `usedById` dipaksa untuk surveyor). `PRD.md`: Feature baru di §3 + acceptance criteria.

- [ ] **Step 4: Seluruh test + lint + typecheck**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: semua hijau.

- [ ] **Step 5: Commit**

```bash
git add lib/db/seed.ts e2e/equipment.spec.ts tasks.md PRD.md
git commit -m "docs(inventaris): seed, e2e, dan catatan Phase 14"
```
