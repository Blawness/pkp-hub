# Inventaris — Quantity per Item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin register an alat as a **jenis** (`equipmentItem`) with several **unit fisik** (`equipment`) under it, each unit keeping its own unique `code`, so the inventory list shows aggregate tersedia/dipinjam counts per jenis without losing per-unit borrow tracking.

**Architecture:** New `equipmentItem` table (name/category/image) sits above the existing `equipment` table, which becomes pure unit-fisik (adds `itemId` FK + unique `code`, drops `name`/`category`/`image`). `equipmentUsage` is untouched — it still points at `equipment.id`, so the partial unique index anti-double-checkout keeps working exactly as before. Migration runs in three stages (nullable columns → data backfill script → lock constraints + drop old columns) so no existing alat data is lost.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres/Neon), Zod, next-safe-action, Vitest (real dev DB, `fileParallelism: false`), Playwright.

## Global Constraints

- Tests hit the real Neon dev branch (`.env.local`) — never seed/test against `.env.prod`.
- Server actions follow the 3-file split: `*-schemas.ts` (Zod), `*-logic.ts` (pure logic + guards, unit tested), `*.ts` (`"use server"` thin wrapper using `adminActionClient`/`staffActionClient`).
- Every RSC/route/action touching project/client data goes through `lib/auth-guards.ts` (`requireUser`/`requireRole`/`assertProjectAccess`/`listProjectsForUser`) — never query `projects`/`clients` directly to bypass it.
- Derived state (counts, status) is computed, never stored as an editable column.
- `equipment` rows are soft-deleted (`archivedAt`), never hard-deleted.
- `purchasePrice`/`purchaseDate` must never reach non-admin query results — pick columns explicitly, never `db.select().from(equipment)`.
- Run `pnpm typecheck` and `pnpm lint` after any non-trivial change; run the relevant vitest file with `node --env-file=.env.local node_modules/vitest/vitest.mjs run <file>`.
- Spec: `docs/superpowers/specs/2026-07-16-inventaris-quantity-unit-design.md` — this plan implements it in full; consult it for the "why" behind any step.

---

## Task 1: Schema stage 1/3 — add `equipmentItem` table + nullable `itemId`/`code` on `equipment`

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Produces: `equipmentItem` table (`id`, `name`, `category`, `image`, `createdAt`, `updatedAt`), `equipmentItemRelations`. `equipment` table gains nullable `itemId` (FK → `equipmentItem.id`, restrict) and nullable `code` (text) — `name`/`category`/`image` stay on `equipment` for now (still needed by the Task 2 backfill script). `equipmentRelations` gains `item: one(equipmentItem, ...)`.

- [ ] **Step 1: Add the `equipmentItem` table above `equipment` in `lib/db/schema.ts`**

Insert this immediately before the `export const equipment = pgTable(` line (currently around line 393):

```ts
/**
 * Jenis alat (spec 2026-07-16) — "GPS RTK Trimble R8", bukan unit fisiknya.
 * Field yang sama untuk semua unit sejenis (nama, kategori, gambar) tinggal
 * di sini; yang beda per unit fisik (kode, kondisi, data pembelian) tinggal
 * di `equipment`. Memisahkan keduanya memungkinkan daftar alat menunjukkan
 * "5 total, 3 tersedia, 2 dipinjam" per jenis tanpa kehilangan identitas
 * unit fisik mana yang sedang di tangan siapa — `equipment` tetap satu baris
 * = satu unit fisik, invarian yang sama dengan spec 2026-07-14.
 *
 * TIDAK ADA `archivedAt` di sini dengan sengaja: arsip tetap per UNIT
 * (`equipment.archivedAt`), bukan per jenis — mengarsipkan satu jenis alat
 * sekaligus bukan cakupan fitur ini (lihat spec §Ruang lingkup).
 */
export const equipmentItem = pgTable("equipment_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  category: equipmentCategory("category").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Add nullable `itemId`/`code` to the `equipment` table definition**

Replace the existing `equipment` table definition with:

```ts
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: equipmentCategory("category").notNull(),
    // BARU (spec 2026-07-16, tahap 1/3): nullable sementara sampai backfill
    // (Task 2) selesai — Task 3 mengunci NOT NULL/UNIQUE dan membuang
    // name/category/image lama dari tabel ini.
    itemId: uuid("item_id").references(() => equipmentItem.id, { onDelete: "restrict" }),
    code: text("code"),
    serialNumber: text("serial_number"),
    condition: equipmentCondition("condition").notNull().default("tersedia"),
    // URL objek storage (WebP, dioptimasi di klien). `fileUrl` mentah — jangan
    // diserahkan langsung ke browser saat driver R2; pakai `downloadUrlFor`.
    image: text("image"),
    // ADMIN-ONLY. Dipangkas di level query untuk surveyor (equipment-logic.ts).
    purchaseDate: date("purchase_date", { mode: "string" }),
    purchasePrice: bigint("purchase_price", { mode: "number" }),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("equipment_item_id_idx").on(t.itemId),
    index("equipment_condition_idx").on(t.condition),
    index("equipment_archived_at_idx").on(t.archivedAt),
  ],
);
```

- [ ] **Step 3: Add `equipmentItemRelations` and update `equipmentRelations`**

Find the existing `equipmentRelations` export (near the bottom of the file):

```ts
export const equipmentRelations = relations(equipment, ({ many }) => ({
  usages: many(equipmentUsage),
}));
```

Replace it with (adding `equipmentItemRelations` right above it):

```ts
export const equipmentItemRelations = relations(equipmentItem, ({ many }) => ({
  units: many(equipment),
}));

export const equipmentRelations = relations(equipment, ({ one, many }) => ({
  item: one(equipmentItem, { fields: [equipment.itemId], references: [equipmentItem.id] }),
  usages: many(equipmentUsage),
}));
```

- [ ] **Step 4: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file appears under `drizzle/migrations/` (e.g. `00XX_<name>.sql`) containing `CREATE TABLE "equipment_item"`, `ALTER TABLE "equipment" ADD COLUMN "item_id"`, `ALTER TABLE "equipment" ADD COLUMN "code"`, plus the new FK and indexes. Read the generated file to confirm no column is dropped and nothing is `NOT NULL` yet.

- [ ] **Step 5: Apply the migration to the dev DB**

Run: `pnpm db:migrate`
Expected: exits 0, no errors.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: passes (schema-only change, nothing consumes the new columns yet).

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts drizzle/migrations
git commit -m "$(cat <<'EOF'
feat(db): add equipmentItem table + nullable equipment.itemId/code (stage 1/3)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backfill script — migrate existing `equipment` rows into `equipmentItem` + `code`

**Files:**
- Create: `scripts/backfill-equipment-items.ts`

**Interfaces:**
- Consumes: `equipmentItem`, `equipment` from `lib/db/schema.ts` (Task 1).
- Produces: every existing `equipment` row ends up with a non-null `itemId` pointing at a freshly created `equipmentItem`, and a non-null `code` (from `serialNumber` if present and not already used, else `UNIT-<8-char id prefix>`).

- [ ] **Step 1: Write the script**

```ts
/**
 * Migrasi data sekali-pakai (spec 2026-07-16, tahap 2/3): tiap baris
 * `equipment` yang ada sebelum fitur quantity-per-item dijalankan tidak
 * punya `itemId`/`code`. Skrip ini membuat SATU `equipmentItem` per baris
 * (dari name/category/image lama) dan mengisi `itemId`/`code`-nya.
 *
 * `code` diisi dari `serialNumber` kalau ada & belum dipakai unit lain;
 * kalau tidak, dari 8 karakter pertama id (`UNIT-XXXXXXXX`) — placeholder
 * yang admin bisa ganti belakangan lewat form edit unit.
 *
 * AMAN: hanya menyentuh baris yang `itemId`-nya masih NULL — bisa dijalankan
 * ulang tanpa efek samping (idempotent).
 *
 *   pnpm exec tsx --env-file=.env.local scripts/backfill-equipment-items.ts
 */
import { eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment, equipmentItem } from "@/lib/db/schema";

async function main() {
  const rows = await db
    .select({
      id: equipment.id,
      name: equipment.name,
      category: equipment.category,
      image: equipment.image,
      serialNumber: equipment.serialNumber,
    })
    .from(equipment)
    .where(isNull(equipment.itemId));

  console.log(`${rows.length} unit tanpa itemId ditemukan.`);

  const usedCodes = new Set<string>();

  for (const row of rows) {
    const [item] = await db
      .insert(equipmentItem)
      .values({ name: row.name, category: row.category, image: row.image })
      .returning();

    let code = row.serialNumber?.trim() || "";
    if (!code || usedCodes.has(code)) {
      code = `UNIT-${row.id.slice(0, 8).toUpperCase()}`;
    }
    usedCodes.add(code);

    await db.update(equipment).set({ itemId: item.id, code }).where(eq(equipment.id, row.id));

    console.log(`  ${row.name} -> item ${item.id}, code "${code}"`);
  }

  console.log("Backfill selesai.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

- [ ] **Step 2: Run it against the dev DB**

Run: `pnpm exec tsx --env-file=.env.local scripts/backfill-equipment-items.ts`
Expected: prints one line per existing `equipment` row (from seed data — `pnpm db:seed` fixtures if already seeded, or none if the table is empty) and ends with `Backfill selesai.`, exit code 0.

- [ ] **Step 3: Verify no row is left with a NULL itemId/code**

Run: `pnpm db:studio` and inspect the `equipment` table, or run this one-off query via `psql`/drizzle studio: confirm `itemId` and `code` are populated for every row. (No automated test for this step — it's a one-time data check before Task 3 locks the constraints.)

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-equipment-items.ts
git commit -m "$(cat <<'EOF'
feat(db): backfill script for equipmentItem + equipment.code (stage 2/3)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Schema stage 3/3 — lock constraints, drop old columns

**Files:**
- Modify: `lib/db/schema.ts`

**Interfaces:**
- Consumes: Task 2 must have run against the dev DB first (every row has `itemId`+`code`) or this migration will fail on the `NOT NULL` conversion.
- Produces: `equipment.itemId` and `equipment.code` become `NOT NULL`; `code` gets a unique index (`equipment_code_uniq`); `equipment.name`/`category`/`image` are dropped.

- [ ] **Step 1: Edit the `equipment` table definition to its final shape**

Replace the `equipment` table definition (from Task 1) with:

```ts
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => equipmentItem.id, { onDelete: "restrict" }),
    // Kode inventaris studio — BUKAN serialNumber (nomor seri pabrik di bawah,
    // opsional & tidak dijamin unik). `code` dikontrol studio sendiri, wajib,
    // unik, dipakai untuk saling merujuk di lapangan/laporan.
    code: text("code").notNull(),
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
    index("equipment_item_id_idx").on(t.itemId),
    index("equipment_condition_idx").on(t.condition),
    index("equipment_archived_at_idx").on(t.archivedAt),
    uniqueIndex("equipment_code_uniq").on(t.code),
  ],
);
```

Note: `name`, `category`, and `image` are gone from this table — they live on `equipmentItem` now.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new migration file with `ALTER TABLE "equipment" ALTER COLUMN "item_id" SET NOT NULL`, `ALTER TABLE "equipment" ALTER COLUMN "code" SET NOT NULL`, `CREATE UNIQUE INDEX "equipment_code_uniq"`, and `ALTER TABLE "equipment" DROP COLUMN "name"`/`"category"`/`"image"`. Read it to confirm.

- [ ] **Step 3: Apply the migration**

Run: `pnpm db:migrate`
Expected: exits 0. If it fails with a `NOT NULL` violation, Task 2's backfill did not reach every row — re-run the backfill script (Task 2 Step 2) and retry.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: **fails** at this point — every file that still references `equipment.name`/`equipment.category`/`equipment.image` (the logic layer, forms, pages, seed) is now broken. This is expected; the remaining tasks fix each consumer. Confirm the errors are all in files this plan touches later (`lib/actions/equipment-logic.ts`, `lib/actions/equipment.test.ts`, `lib/db/seed.ts`, `app/dashboard/equipment/**`, `components/equipment/**`, `app/dashboard/projects/[id]/page.tsx`) and nowhere else.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/migrations
git commit -m "$(cat <<'EOF'
feat(db): lock equipment.itemId/code NOT NULL+UNIQUE, drop name/category/image (stage 3/3)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `summarizeUnits` — pure aggregate function

**Files:**
- Modify: `lib/equipment/derive.ts`
- Test: `lib/equipment/derive.test.ts`

**Interfaces:**
- Produces: `summarizeUnits(units: { condition: EquipmentCondition; activeUsage: unknown }[]): { total: number; tersedia: number; terpinjam: number; perawatan: number; rusak: number }` — pure, no DB. Later consumed by `equipment-items-logic.ts` (Task 6) and `app/dashboard/equipment/page.tsx` (Task 15).

- [ ] **Step 1: Write the failing test**

Append to `lib/equipment/derive.test.ts`:

```ts
describe("summarizeUnits", () => {
  it("item tanpa unit -> semua nol", () => {
    expect(summarizeUnits([])).toEqual({
      total: 0,
      tersedia: 0,
      terpinjam: 0,
      perawatan: 0,
      rusak: 0,
    });
  });

  it("menghitung agregat dari campuran kondisi dan sesi aktif", () => {
    const units = [
      { condition: "tersedia" as const, activeUsage: null },
      { condition: "tersedia" as const, activeUsage: { usageId: "u1" } },
      { condition: "perawatan" as const, activeUsage: null },
      { condition: "rusak" as const, activeUsage: null },
      { condition: "pensiun" as const, activeUsage: null },
    ];
    expect(summarizeUnits(units)).toEqual({
      total: 5,
      tersedia: 1,
      terpinjam: 1,
      perawatan: 1,
      rusak: 1,
    });
  });

  // Unit yang sedang dipinjam dihitung "terpinjam" walau condition-nya masih
  // "tersedia" secara fisik — sesi aktif MENIMPA condition, sama seperti
  // kolom Status gabungan di tabel alat sebelumnya.
  it("sesi aktif menimpa condition tersedia", () => {
    const units = [{ condition: "tersedia" as const, activeUsage: { usageId: "u1" } }];
    expect(summarizeUnits(units)).toEqual({
      total: 1,
      tersedia: 0,
      terpinjam: 1,
      perawatan: 0,
      rusak: 0,
    });
  });
});
```

Add `summarizeUnits` to the existing import at the top of the file:

```ts
import {
  borrowRejection,
  formatDuration,
  summarizeUnits,
  usageDurationMs,
  validateUsageWindow,
} from "@/lib/equipment/derive";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/equipment/derive.test.ts`
Expected: FAIL — `summarizeUnits is not defined` / not exported.

- [ ] **Step 3: Implement `summarizeUnits`**

Append to `lib/equipment/derive.ts`:

```ts
/**
 * Agregat tersedia/dipinjam/perawatan/rusak untuk sekumpulan unit — dipakai
 * baik untuk ringkasan total (semua unit lintas item) maupun ringkasan per
 * item (spec 2026-07-16). Sesi aktif MENIMPA `condition`: unit yang sedang
 * dipinjam dihitung "terpinjam" walau `condition`-nya "tersedia".
 */
export function summarizeUnits(units: { condition: EquipmentCondition; activeUsage: unknown }[]): {
  total: number;
  tersedia: number;
  terpinjam: number;
  perawatan: number;
  rusak: number;
} {
  return {
    total: units.length,
    tersedia: units.filter((u) => !u.activeUsage && u.condition === "tersedia").length,
    terpinjam: units.filter((u) => Boolean(u.activeUsage)).length,
    perawatan: units.filter((u) => !u.activeUsage && u.condition === "perawatan").length,
    rusak: units.filter((u) => !u.activeUsage && u.condition === "rusak").length,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/equipment/derive.test.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add lib/equipment/derive.ts lib/equipment/derive.test.ts
git commit -m "$(cat <<'EOF'
feat(equipment): add summarizeUnits pure aggregate function

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `equipment-items-schemas.ts`

**Files:**
- Create: `lib/actions/equipment-items-schemas.ts`

**Interfaces:**
- Consumes: `equipmentCategorySchema` exported from `lib/actions/equipment-schemas.ts` (already exists, unchanged).
- Produces: `createEquipmentItemInputSchema`, `CreateEquipmentItemInput`, `updateEquipmentItemInputSchema`, `UpdateEquipmentItemInput` — consumed by Task 6 (logic) and Task 7 (action wrapper).

- [ ] **Step 1: Write the file**

```ts
import { z } from "zod";
import { equipmentCategorySchema } from "@/lib/actions/equipment-schemas";

/** Skema input jenis alat (spec 2026-07-16). Dipisah dari `equipment-schemas.ts` (unit fisik) — dua domain terpisah, dua file terpisah, pola yang sama dengan modul lain. */

export const createEquipmentItemInputSchema = z.object({
  name: z.string().trim().min(1, "Nama alat wajib diisi.").max(160),
  category: equipmentCategorySchema,
  // URL objek storage hasil upload (WebP). `null` = hapus gambar.
  image: z.string().trim().max(1000).nullable().optional(),
});
export type CreateEquipmentItemInput = z.infer<typeof createEquipmentItemInputSchema>;

export const updateEquipmentItemInputSchema = createEquipmentItemInputSchema.extend({
  itemId: z.uuid(),
});
export type UpdateEquipmentItemInput = z.infer<typeof updateEquipmentItemInputSchema>;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors from this file (it has no consumers yet).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/equipment-items-schemas.ts
git commit -m "$(cat <<'EOF'
feat(equipment): add equipment-items-schemas.ts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `equipment-items-logic.ts` + tests

**Files:**
- Create: `lib/actions/equipment-items-logic.ts`
- Test: `lib/actions/equipment-items.test.ts`

**Interfaces:**
- Consumes: `equipmentCategorySchema`-typed input from Task 5; `equipmentItem` table from `lib/db/schema.ts` (Task 3); `summarizeUnits` from Task 4; `listEquipmentForUser`/`EquipmentListItem` from `lib/actions/equipment-logic.ts` (**not yet updated** — this task's tests will fail until Task 9 lands `itemId`/`code`/`itemName` on `EquipmentListItem`. Write this task's code now; its test file will only go green after Task 9. Order note: implement Task 6 code first, but don't expect its test to pass until Task 9 is also done — run it again at the end of Task 9).
- Produces: `EquipmentItemRow`, `EquipmentItemWithUnits`, `listEquipmentItemsForUser(user)`, `createEquipmentItemForUser(user, input)`, `updateEquipmentItemForUser(user, input)` — consumed by Task 7 (action wrapper), Task 13/14 (item form components), Task 15 (page.tsx).

- [ ] **Step 1: Write the logic file**

```ts
import { desc, eq } from "drizzle-orm";
import type {
  CreateEquipmentItemInput,
  UpdateEquipmentItemInput,
} from "@/lib/actions/equipment-items-schemas";
import { type EquipmentListItem, listEquipmentForUser } from "@/lib/actions/equipment-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { equipmentItem } from "@/lib/db/schema";
import { summarizeUnits } from "@/lib/equipment/derive";
import { storage } from "@/lib/storage";

/**
 * Jenis alat (`equipmentItem`) — spec 2026-07-16. Unit fisiknya (`equipment`)
 * dan logikanya ada di `equipment-logic.ts`; file ini hanya mengurus jenis +
 * pengelompokan unit per jenis untuk daftar inventaris.
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

export type EquipmentItemRow = {
  id: string;
  name: string;
  category: string;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EquipmentItemWithUnits = {
  item: EquipmentItemRow;
  units: EquipmentListItem[];
  summary: ReturnType<typeof summarizeUnits>;
};

/**
 * Semua jenis alat + unit-unitnya (dikelompokkan dari `listEquipmentForUser`)
 * + agregat per jenis. Item tanpa unit tetap tampil, dengan summary nol —
 * supaya admin masih bisa "+ Tambah unit" untuk jenis yang baru dibuat.
 */
export async function listEquipmentItemsForUser(
  user: SessionUser,
): Promise<EquipmentItemWithUnits[]> {
  requireStaff(user);

  const items = await db.select().from(equipmentItem).orderBy(desc(equipmentItem.createdAt));
  const units = await listEquipmentForUser(user);

  const unitsByItemId = new Map<string, EquipmentListItem[]>();
  for (const unit of units) {
    const list = unitsByItemId.get(unit.itemId) ?? [];
    list.push(unit);
    unitsByItemId.set(unit.itemId, list);
  }

  return items.map((item) => {
    const itemUnits = unitsByItemId.get(item.id) ?? [];
    return { item, units: itemUnits, summary: summarizeUnits(itemUnits) };
  });
}

export async function createEquipmentItemForUser(
  user: SessionUser,
  input: CreateEquipmentItemInput,
): Promise<EquipmentItemRow> {
  requireAdmin(user);

  const [row] = await db
    .insert(equipmentItem)
    .values({
      name: input.name,
      category: input.category,
      image: input.image && input.image.length > 0 ? input.image : null,
    })
    .returning();
  return row;
}

/** Sama alasan dengan `equipment-logic.ts` sebelumnya: hapus objek gambar lama best-effort, jangan gagalkan operasi utama. */
async function deleteImageObject(fileUrl: string): Promise<void> {
  try {
    await storage.delete(storage.keyFromUrl(fileUrl));
  } catch {
    // abaikan
  }
}

export async function updateEquipmentItemForUser(
  user: SessionUser,
  input: UpdateEquipmentItemInput,
): Promise<EquipmentItemRow> {
  requireAdmin(user);

  const [existing] = await db
    .select({ image: equipmentItem.image })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, input.itemId));
  if (!existing) throw new Error("Jenis alat tidak ditemukan.");

  const nextImage = input.image && input.image.length > 0 ? input.image : null;

  const [row] = await db
    .update(equipmentItem)
    .set({
      name: input.name,
      category: input.category,
      image: nextImage,
      updatedAt: new Date(),
    })
    .where(eq(equipmentItem.id, input.itemId))
    .returning();
  if (!row) throw new Error("Jenis alat tidak ditemukan.");

  if (existing.image && existing.image !== nextImage) {
    await deleteImageObject(existing.image);
  }
  return row;
}
```

- [ ] **Step 2: Write the test file**

```ts
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEquipmentItemForUser,
  listEquipmentItemsForUser,
  updateEquipmentItemForUser,
} from "@/lib/actions/equipment-items-logic";
import { borrowEquipmentForUser, createEquipmentForUser } from "@/lib/actions/equipment-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, equipment, equipmentItem, equipmentUsage, projects, users } from "@/lib/db/schema";

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let projectId: string;

beforeAll(async () => {
  await db.delete(equipmentUsage);
  await db.delete(equipment);
  await db.delete(equipmentItem);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Item Admin", email: "item-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Item Surveyor", email: "item-surveyor@fixture.test", role: "surveyor" },
    { id: clientUserId, name: "Item Client", email: "item-client@fixture.test", role: "client" },
  ]);

  admin = { id: adminId, name: "Item Admin", email: "item-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Item Surveyor",
    email: "item-surveyor@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Item Client",
    email: "item-client@fixture.test",
    role: "client",
  };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien Item", type: "individual", userId: clientUserId }])
    .returning();

  const [project] = await db
    .insert(projects)
    .values({
      title: "Proyek Item",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId,
      status: "baru",
      projectValue: 1_000_000,
      paymentStatus: "belum",
    })
    .returning();
  projectId = project.id;
});

afterAll(() => {
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("batas akses", () => {
  it("surveyor tidak bisa menambah jenis alat", async () => {
    await expect(
      createEquipmentItemForUser(surveyor, { name: "Curang", category: "drone" }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengubah jenis alat", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Item-1", category: "drone" });
    await expect(
      updateEquipmentItemForUser(surveyor, { itemId: item.id, name: "Item-1", category: "drone" }),
    ).rejects.toThrow(/admin/i);
  });

  it("klien tidak bisa melihat daftar jenis alat", async () => {
    await expect(listEquipmentItemsForUser(clientUser)).rejects.toThrow();
  });
});

describe("gambar jenis alat", () => {
  it("menyimpan URL gambar saat create", async () => {
    const item = await createEquipmentItemForUser(admin, {
      name: "Item-Gambar",
      category: "drone",
      image: "/api/storage/equipment/aaa.webp",
    });
    expect(item.image).toBe("/api/storage/equipment/aaa.webp");
  });

  it("mengganti gambar saat update (dan tidak melempar walau objek lama tak ada)", async () => {
    const item = await createEquipmentItemForUser(admin, {
      name: "Item-GantiGambar",
      category: "drone",
      image: "/api/storage/equipment/lama.webp",
    });

    const updated = await updateEquipmentItemForUser(admin, {
      itemId: item.id,
      name: "Item-GantiGambar",
      category: "drone",
      image: "/api/storage/equipment/baru.webp",
    });
    expect(updated.image).toBe("/api/storage/equipment/baru.webp");
  });

  it("menghapus gambar saat image di-set null", async () => {
    const item = await createEquipmentItemForUser(admin, {
      name: "Item-HapusGambar",
      category: "drone",
      image: "/api/storage/equipment/ada.webp",
    });

    const updated = await updateEquipmentItemForUser(admin, {
      itemId: item.id,
      name: "Item-HapusGambar",
      category: "drone",
      image: null,
    });
    expect(updated.image).toBeNull();
  });
});

describe("listEquipmentItemsForUser", () => {
  it("item tanpa unit tampil dengan summary nol", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Item-Kosong", category: "laptop" });
    const rows = await listEquipmentItemsForUser(admin);
    const row = rows.find((r) => r.item.id === item.id);
    expect(row).toBeDefined();
    expect(row?.summary).toEqual({ total: 0, tersedia: 0, terpinjam: 0, perawatan: 0, rusak: 0 });
  });

  it("mengelompokkan unit per item dan menghitung agregat tersedia/dipinjam dengan benar", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Item-Grup", category: "gps_rtk" });
    const unit1 = await createEquipmentForUser(admin, {
      itemId: item.id,
      code: "GRP-01",
      condition: "tersedia",
    });
    const unit2 = await createEquipmentForUser(admin, {
      itemId: item.id,
      code: "GRP-02",
      condition: "tersedia",
    });
    await createEquipmentForUser(admin, {
      itemId: item.id,
      code: "GRP-03",
      condition: "perawatan",
    });
    await borrowEquipmentForUser(admin, {
      equipmentId: unit1.id,
      projectId,
      startedAt: new Date(),
    });

    const rows = await listEquipmentItemsForUser(admin);
    const row = rows.find((r) => r.item.id === item.id);
    expect(row?.units).toHaveLength(3);
    expect(row?.units.map((u) => u.id)).toContain(unit2.id);
    expect(row?.summary).toEqual({ total: 3, tersedia: 1, terpinjam: 1, perawatan: 1, rusak: 0 });
  });
});
```

- [ ] **Step 3: Run the test — expect failures (Task 9 not done yet)**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/equipment-items.test.ts`
Expected: FAIL — `createEquipmentForUser` in `equipment-logic.ts` still expects `{ name, category, ... }`, not `{ itemId, code, ... }` (Task 9 hasn't landed). This is expected at this point in the plan; do not attempt to fix `equipment-logic.ts` here — that's Task 9. Move on to Tasks 7 and 8 first (they don't depend on Task 9 either), then return to this test at the end of Task 9's steps.

- [ ] **Step 4: Commit (code + test, both present even though the test doesn't pass yet)**

```bash
git add lib/actions/equipment-items-logic.ts lib/actions/equipment-items.test.ts
git commit -m "$(cat <<'EOF'
feat(equipment): add equipment-items-logic.ts + tests (item CRUD, grouping)

Tests will go green once Task 9 lands the unit-schema changes in
equipment-logic.ts that this file's grouping depends on.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `equipment-items.ts` server action wrapper

**Files:**
- Create: `lib/actions/equipment-items.ts`

**Interfaces:**
- Consumes: `createEquipmentItemForUser`/`updateEquipmentItemForUser` (Task 6), `createEquipmentItemInputSchema`/`updateEquipmentItemInputSchema` (Task 5), `adminActionClient` from `lib/actions/safe-action.ts` (existing, unchanged).
- Produces: `createEquipmentItem`, `updateEquipmentItem` — consumed by `components/equipment/equipment-item-form.tsx` (Task 13).

- [ ] **Step 1: Write the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  createEquipmentItemForUser,
  updateEquipmentItemForUser,
} from "@/lib/actions/equipment-items-logic";
import {
  createEquipmentItemInputSchema,
  updateEquipmentItemInputSchema,
} from "@/lib/actions/equipment-items-schemas";
import { adminActionClient } from "@/lib/actions/safe-action";

/**
 * Server action jenis alat. Logika + guard ada di `equipment-items-logic.ts`
 * (diuji langsung); `adminActionClient` di sini adalah lapis pertama yang
 * terikat request — bukan penggantinya.
 */

export const createEquipmentItem = adminActionClient
  .inputSchema(createEquipmentItemInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await createEquipmentItemForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });

export const updateEquipmentItem = adminActionClient
  .inputSchema(updateEquipmentItemInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await updateEquipmentItemForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/equipment-items.ts
git commit -m "$(cat <<'EOF'
feat(equipment): add equipment-items.ts server action wrapper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update `equipment-schemas.ts` for unit fields (`itemId`/`code`, drop `image`)

**Files:**
- Modify: `lib/actions/equipment-schemas.ts`

**Interfaces:**
- Produces: `createEquipmentInputSchema` now requires `itemId` + `code`, drops `name`/`category`/`image`. `updateEquipmentInputSchema` = same shape minus `itemId` (immutable after creation), plus `equipmentId`. Consumed by Task 9 (logic), Task 13 (unit form component).

- [ ] **Step 1: Replace the file's create/update schemas**

Replace the full contents of `lib/actions/equipment-schemas.ts` with:

```ts
import { z } from "zod";

/** Skema input inventaris alat — UNIT FISIK (spec 2026-07-14, direvisi spec 2026-07-16). Jenis alat ada di `equipment-items-schemas.ts`. Dipisah dari logika (server-only) — komponen klien boleh mengimpor ini. */

export const equipmentCategorySchema = z.enum([
  "instrumen_ukur",
  "gps_rtk",
  "drone",
  "aksesoris_survey",
  "laptop",
  "inventaris_kantor",
  "lainnya",
]);
export type EquipmentCategoryInput = z.infer<typeof equipmentCategorySchema>;

export const equipmentConditionSchema = z.enum(["tersedia", "perawatan", "rusak", "pensiun"]);
export type EquipmentConditionInput = z.infer<typeof equipmentConditionSchema>;

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus dalam format YYYY-MM-DD.");

export const createEquipmentInputSchema = z.object({
  itemId: z.uuid(),
  // Kode inventaris studio, unik per unit — lihat komentar di lib/db/schema.ts.
  code: z.string().trim().min(1, "Kode unit wajib diisi.").max(60),
  serialNumber: z.string().trim().max(120).optional(),
  condition: equipmentConditionSchema.default("tersedia"),
  purchaseDate: dateString.nullable().optional(),
  purchasePrice: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().trim().max(1000).optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentInputSchema>;

// `itemId` sengaja TIDAK ada di sini — unit tidak pindah item setelah dibuat
// (lihat spec §Ruang lingkup, non-goal).
export const updateEquipmentInputSchema = createEquipmentInputSchema
  .omit({ itemId: true })
  .extend({ equipmentId: z.uuid() });
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

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: new errors appear in `lib/actions/equipment-logic.ts`, `lib/actions/equipment.test.ts`, `components/equipment/equipment-form.tsx` — all fixed in Tasks 9, 10, 13. Confirm no errors outside those files (plus the ones already broken from Task 3).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/equipment-schemas.ts
git commit -m "$(cat <<'EOF'
feat(equipment): equipment-schemas.ts unit fields become itemId+code, drop image

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Rewrite `equipment-logic.ts` for the unit/item join

**Files:**
- Modify: `lib/actions/equipment-logic.ts`

**Interfaces:**
- Consumes: `equipment`, `equipmentItem` from `lib/db/schema.ts` (Task 3); `CreateEquipmentInput`/`UpdateEquipmentInput` from Task 8.
- Produces: `EquipmentRow` now has `itemId`, `itemName`, `category`, `image`, `code` (no more bare `name`). `EquipmentListItem`, `listEquipmentForUser`, `getEquipmentForUser` unchanged in name/signature but now join `equipmentItem`. `createEquipmentForUser`/`updateEquipmentForUser` take `itemId`+`code` (create) or just `code` (update, `itemId` fixed). This is what Task 6's `equipment-items.test.ts` and Task 15/16 (UI) depend on.

- [ ] **Step 1: Replace the full file**

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
import { equipment, equipmentItem, equipmentUsage, projects, users } from "@/lib/db/schema";
import {
  borrowRejection,
  type EquipmentCondition,
  validateUsageWindow,
} from "@/lib/equipment/derive";

/**
 * Inventaris alat — UNIT FISIK (spec 2026-07-14, direvisi spec 2026-07-16).
 * Logika + guard dipisah dari pembungkus "use server" (`equipment.ts`) supaya
 * bisa diuji langsung — pola `payments-logic.ts`. Jenis alat (`equipmentItem`)
 * ada di `equipment-items-logic.ts`, file terpisah.
 *
 * DUA ATURAN YANG MUDAH DILANGGAR TANPA SADAR:
 *
 * 1. `purchasePrice`/`purchaseDate` TIDAK BOLEH sampai ke surveyor. Karena itu
 *    query untuk non-admin memilih kolom secara eksplisit — jangan sekali-kali
 *    ganti jadi `db.select().from(equipment)`, itu mengirim semuanya.
 * 2. `usedById` untuk surveyor SELALU dipaksa jadi id dirinya di server. Form
 *    yang tidak merender pilihannya bukan penegakan.
 */

export type EquipmentRow = {
  id: string;
  itemId: string;
  itemName: string;
  category: string;
  image: string | null;
  code: string;
  serialNumber: string | null;
  condition: EquipmentCondition;
  purchaseDate: string | null;
  purchasePrice: number | null;
  notes: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EquipmentRowSafe = Omit<EquipmentRow, "purchaseDate" | "purchasePrice">;

export type ActiveUsage = {
  usageId: string;
  usedById: string;
  usedByName: string;
  projectId: string;
  projectTitle: string;
  startedAt: Date;
};

export type EquipmentListItem = (EquipmentRow | EquipmentRowSafe) & {
  activeUsage: ActiveUsage | null;
};

export type UsageRow = {
  id: string;
  equipmentId: string;
  projectId: string;
  usedById: string;
  startedAt: Date;
  endedAt: Date | null;
  note: string | null;
  recordedById: string;
  createdAt: Date;
};

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
      throw new Error("Proyek tidak ditemukan atau Anda tidak punya akses.");
    }
    throw error;
  }
}

const adminColumns = {
  id: equipment.id,
  itemId: equipment.itemId,
  itemName: equipmentItem.name,
  category: equipmentItem.category,
  image: equipmentItem.image,
  code: equipment.code,
  serialNumber: equipment.serialNumber,
  condition: equipment.condition,
  purchaseDate: equipment.purchaseDate,
  purchasePrice: equipment.purchasePrice,
  notes: equipment.notes,
  archivedAt: equipment.archivedAt,
  createdAt: equipment.createdAt,
  updatedAt: equipment.updatedAt,
};

const safeColumns = {
  id: equipment.id,
  itemId: equipment.itemId,
  itemName: equipmentItem.name,
  category: equipmentItem.category,
  image: equipmentItem.image,
  code: equipment.code,
  serialNumber: equipment.serialNumber,
  condition: equipment.condition,
  notes: equipment.notes,
  archivedAt: equipment.archivedAt,
  createdAt: equipment.createdAt,
  updatedAt: equipment.updatedAt,
};

/** Sesi aktif (`endedAt IS NULL`) untuk setiap `equipmentId`, keyed by id. */
async function activeUsageByEquipmentId(): Promise<Map<string, ActiveUsage>> {
  const rows = await db
    .select({
      usageId: equipmentUsage.id,
      equipmentId: equipmentUsage.equipmentId,
      usedById: equipmentUsage.usedById,
      usedByName: users.name,
      projectId: equipmentUsage.projectId,
      projectTitle: projects.title,
      startedAt: equipmentUsage.startedAt,
    })
    .from(equipmentUsage)
    .innerJoin(users, eq(equipmentUsage.usedById, users.id))
    .innerJoin(projects, eq(equipmentUsage.projectId, projects.id))
    .where(isNull(equipmentUsage.endedAt));

  const map = new Map<string, ActiveUsage>();
  for (const row of rows) {
    map.set(row.equipmentId, {
      usageId: row.usageId,
      usedById: row.usedById,
      usedByName: row.usedByName,
      projectId: row.projectId,
      projectTitle: row.projectTitle,
      startedAt: row.startedAt,
    });
  }
  return map;
}

/** Admin: seluruh kolom termasuk harga & tanggal beli. Surveyor: TANPA keduanya. Baris terarsip tidak ikut — dikelompokkan per jenis di `equipment-items-logic.ts`. */
export async function listEquipmentForUser(user: SessionUser): Promise<EquipmentListItem[]> {
  requireStaff(user);

  const activeMap = await activeUsageByEquipmentId();

  if (user.role === "admin") {
    const rows = await db
      .select(adminColumns)
      .from(equipment)
      .innerJoin(equipmentItem, eq(equipment.itemId, equipmentItem.id))
      .where(isNull(equipment.archivedAt))
      .orderBy(desc(equipment.createdAt));
    return rows.map((row) => ({ ...row, activeUsage: activeMap.get(row.id) ?? null }));
  }

  const rows = await db
    .select(safeColumns)
    .from(equipment)
    .innerJoin(equipmentItem, eq(equipment.itemId, equipmentItem.id))
    .where(isNull(equipment.archivedAt))
    .orderBy(desc(equipment.createdAt));
  return rows.map((row) => ({ ...row, activeUsage: activeMap.get(row.id) ?? null }));
}

export async function getEquipmentForUser(
  user: SessionUser,
  equipmentId: string,
): Promise<EquipmentListItem> {
  requireStaff(user);

  const columns = user.role === "admin" ? adminColumns : safeColumns;
  const [row] = await db
    .select(columns)
    .from(equipment)
    .innerJoin(equipmentItem, eq(equipment.itemId, equipmentItem.id))
    .where(eq(equipment.id, equipmentId));
  if (!row) throw new Error("Alat tidak ditemukan.");

  const [activeRow] = await db
    .select({
      usageId: equipmentUsage.id,
      usedById: equipmentUsage.usedById,
      usedByName: users.name,
      projectId: equipmentUsage.projectId,
      projectTitle: projects.title,
      startedAt: equipmentUsage.startedAt,
    })
    .from(equipmentUsage)
    .innerJoin(users, eq(equipmentUsage.usedById, users.id))
    .innerJoin(projects, eq(equipmentUsage.projectId, projects.id))
    .where(and(eq(equipmentUsage.equipmentId, equipmentId), isNull(equipmentUsage.endedAt)));

  const activeUsage: ActiveUsage | null = activeRow
    ? {
        usageId: activeRow.usageId,
        usedById: activeRow.usedById,
        usedByName: activeRow.usedByName,
        projectId: activeRow.projectId,
        projectTitle: activeRow.projectTitle,
        startedAt: activeRow.startedAt,
      }
    : null;

  return { ...row, activeUsage };
}

/** Riwayat pakai untuk satu alat, terbaru dulu. */
export async function listUsageForEquipment(
  user: SessionUser,
  equipmentId: string,
): Promise<UsageRow[]> {
  requireStaff(user);
  return db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.equipmentId, equipmentId))
    .orderBy(desc(equipmentUsage.startedAt));
}

/**
 * Riwayat pakai untuk satu proyek. `assertProjectAccess` di sini adalah yang
 * membuat surveyor cuma melihat riwayat alat di proyeknya sendiri.
 */
export async function listUsageForProject(
  user: SessionUser,
  projectId: string,
): Promise<UsageRow[]> {
  requireStaff(user);
  await assertProjectAccessOrReject(projectId, user);
  return db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.projectId, projectId))
    .orderBy(desc(equipmentUsage.startedAt));
}

/** Deteksi error dari unique index `equipment_code_uniq` (Postgres code 23505) dan terjemahkan jadi pesan yang enak dibaca. */
function isCodeUniqueViolation(error: unknown): boolean {
  const direct = (error as { code?: unknown } | null)?.code;
  if (direct === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const causeCode = (cause as { code?: unknown } | null)?.code;
  return causeCode === "23505";
}

export async function createEquipmentForUser(
  user: SessionUser,
  input: CreateEquipmentInput,
): Promise<EquipmentRow> {
  requireAdmin(user);

  const [item] = await db
    .select({
      id: equipmentItem.id,
      name: equipmentItem.name,
      category: equipmentItem.category,
      image: equipmentItem.image,
    })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, input.itemId));
  if (!item) throw new Error("Jenis alat tidak ditemukan.");

  try {
    const [row] = await db
      .insert(equipment)
      .values({
        itemId: input.itemId,
        code: input.code,
        serialNumber: input.serialNumber && input.serialNumber.length > 0 ? input.serialNumber : null,
        condition: input.condition,
        purchaseDate: input.purchaseDate ?? null,
        purchasePrice: input.purchasePrice ?? null,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
      })
      .returning();
    return { ...row, itemName: item.name, category: item.category, image: item.image };
  } catch (error) {
    if (isCodeUniqueViolation(error)) {
      throw new Error("Kode unit sudah dipakai — pakai kode lain.");
    }
    throw error;
  }
}

export async function updateEquipmentForUser(
  user: SessionUser,
  input: UpdateEquipmentInput,
): Promise<EquipmentRow> {
  requireAdmin(user);

  const [existing] = await db
    .select({ itemId: equipment.itemId })
    .from(equipment)
    .where(eq(equipment.id, input.equipmentId));
  if (!existing) throw new Error("Alat tidak ditemukan.");

  const [item] = await db
    .select({ name: equipmentItem.name, category: equipmentItem.category, image: equipmentItem.image })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, existing.itemId));

  try {
    const [row] = await db
      .update(equipment)
      .set({
        code: input.code,
        serialNumber: input.serialNumber && input.serialNumber.length > 0 ? input.serialNumber : null,
        condition: input.condition,
        purchaseDate: input.purchaseDate ?? null,
        purchasePrice: input.purchasePrice ?? null,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
        updatedAt: new Date(),
      })
      .where(eq(equipment.id, input.equipmentId))
      .returning();
    if (!row) throw new Error("Alat tidak ditemukan.");
    return { ...row, itemName: item.name, category: item.category, image: item.image };
  } catch (error) {
    if (isCodeUniqueViolation(error)) {
      throw new Error("Kode unit sudah dipakai — pakai kode lain.");
    }
    throw error;
  }
}

export async function archiveEquipmentForUser(
  user: SessionUser,
  input: ArchiveEquipmentInput,
): Promise<EquipmentRow> {
  requireAdmin(user);

  const [row] = await db
    .update(equipment)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(equipment.id, input.equipmentId))
    .returning();
  if (!row) throw new Error("Alat tidak ditemukan.");

  const [item] = await db
    .select({ name: equipmentItem.name, category: equipmentItem.category, image: equipmentItem.image })
    .from(equipmentItem)
    .where(eq(equipmentItem.id, row.itemId));

  return { ...row, itemName: item.name, category: item.category, image: item.image };
}

/**
 * Deteksi error dari partial unique index `equipment_active_usage_uniq`
 * (Postgres code 23505) dan terjemahkan jadi pesan yang enak dibaca. Ini
 * BUKAN pertahanan utamanya — index-nya sudah menegakkan itu — ini cuma
 * penerjemah.
 */
function isActiveUsageUniqueViolation(error: unknown): boolean {
  const direct = (error as { code?: unknown } | null)?.code;
  if (direct === "23505") return true;
  const cause = (error as { cause?: unknown } | null)?.cause;
  const causeCode = (cause as { code?: unknown } | null)?.code;
  return causeCode === "23505";
}

/** Staf. Mencatat sesi pinjam baru. */
export async function borrowEquipmentForUser(
  user: SessionUser,
  input: BorrowEquipmentInput,
): Promise<UsageRow> {
  requireStaff(user);
  await assertProjectAccessOrReject(input.projectId, user);

  // Paksa: surveyor tidak pernah bisa mencatat alat di tangan orang lain.
  const usedById = user.role === "admin" ? (input.usedById ?? user.id) : user.id;

  // Kolom eksplisit: `borrowRejection` hanya butuh `condition`/`archivedAt`.
  // Ini dipanggil surveyor lewat `staffActionClient` — `purchasePrice`/
  // `purchaseDate` (admin-only) tidak boleh sampai ke memori server di sini.
  const [item] = await db
    .select({ id: equipment.id, condition: equipment.condition, archivedAt: equipment.archivedAt })
    .from(equipment)
    .where(eq(equipment.id, input.equipmentId));
  if (!item) throw new Error("Alat tidak ditemukan.");

  const [activeSession] = await db
    .select({ id: equipmentUsage.id })
    .from(equipmentUsage)
    .where(and(eq(equipmentUsage.equipmentId, input.equipmentId), isNull(equipmentUsage.endedAt)));

  const rejection = borrowRejection(item, Boolean(activeSession));
  if (rejection) throw new Error(rejection);

  const windowError = validateUsageWindow(input.startedAt, null, new Date());
  if (windowError) throw new Error(windowError);

  try {
    const [row] = await db
      .insert(equipmentUsage)
      .values({
        equipmentId: input.equipmentId,
        projectId: input.projectId,
        usedById,
        startedAt: input.startedAt,
        note: input.note && input.note.length > 0 ? input.note : null,
        recordedById: user.id,
      })
      .returning();
    return row;
  } catch (error) {
    if (isActiveUsageUniqueViolation(error)) {
      throw new Error("Alat sedang dipakai orang lain.");
    }
    throw error;
  }
}

/** Staf. Menutup sesi pakai. Surveyor hanya boleh menutup sesinya sendiri. */
export async function returnEquipmentForUser(
  user: SessionUser,
  input: ReturnEquipmentInput,
): Promise<UsageRow> {
  requireStaff(user);

  const [session] = await db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.id, input.usageId));
  if (!session) throw new Error("Sesi pakai tidak ditemukan.");
  if (session.endedAt) throw new Error("Sesi pakai ini sudah ditutup.");

  if (user.role === "surveyor" && session.usedById !== user.id) {
    throw new Error("Anda hanya bisa mengembalikan alat yang Anda pegang sendiri.");
  }

  const endedAt = input.endedAt ?? new Date();
  const windowError = validateUsageWindow(session.startedAt, endedAt, new Date());
  if (windowError) throw new Error(windowError);

  const [row] = await db
    .update(equipmentUsage)
    .set({
      endedAt,
      note: input.note && input.note.length > 0 ? input.note : session.note,
    })
    .where(eq(equipmentUsage.id, input.usageId))
    .returning();
  return row;
}

/** Admin-only. Mengoreksi jam mulai/selesai sesi yang sudah ditutup. */
export async function correctUsageForUser(
  user: SessionUser,
  input: CorrectUsageInput,
): Promise<UsageRow> {
  requireAdmin(user);

  const [session] = await db
    .select()
    .from(equipmentUsage)
    .where(eq(equipmentUsage.id, input.usageId));
  if (!session) throw new Error("Sesi pakai tidak ditemukan.");

  const windowError = validateUsageWindow(input.startedAt, input.endedAt, new Date());
  if (windowError) throw new Error(windowError);

  const [row] = await db
    .update(equipmentUsage)
    .set({
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      note: input.note && input.note.length > 0 ? input.note : session.note,
    })
    .where(eq(equipmentUsage.id, input.usageId))
    .returning();
  return row;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: errors remaining only in `lib/actions/equipment.test.ts`, `lib/db/seed.ts`, `components/equipment/equipment-form.tsx`, `components/equipment/equipment-form-dialog.tsx`, `app/dashboard/equipment/page.tsx`, `app/dashboard/equipment/[id]/page.tsx`, `app/dashboard/projects/[id]/page.tsx` — all addressed in later tasks.

- [ ] **Step 3: Re-run Task 6's test — now expect it to pass**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/equipment-items.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/equipment-logic.ts
git commit -m "$(cat <<'EOF'
feat(equipment): equipment-logic.ts joins equipmentItem, unit CRUD takes itemId+code

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Rewrite `equipment.test.ts` for the item+unit shape

**Files:**
- Modify: `lib/actions/equipment.test.ts`

**Interfaces:**
- Consumes: `createEquipmentItemForUser` (Task 6), `createEquipmentForUser`/etc. (Task 9, now itemId+code shaped).
- Produces: all existing borrow/return/correct/access-control tests still pass against the new shape; adds a new "kode unit unik" test.

- [ ] **Step 1: Replace the full file**

```ts
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEquipmentItemForUser } from "@/lib/actions/equipment-items-logic";
import type { EquipmentRow } from "@/lib/actions/equipment-logic";
import {
  archiveEquipmentForUser,
  borrowEquipmentForUser,
  correctUsageForUser,
  createEquipmentForUser,
  getEquipmentForUser,
  listEquipmentForUser,
  returnEquipmentForUser,
  updateEquipmentForUser,
} from "@/lib/actions/equipment-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, equipment, equipmentItem, equipmentUsage, projects, users } from "@/lib/db/schema";

/**
 * Berjalan terhadap DB dev sungguhan, pola yang sama dengan `payments.test.ts`.
 */

let admin: SessionUser;
let surveyor: SessionUser;
let clientUser: SessionUser;
let projectId: string;
let otherProjectId: string;
let unitSeq = 0;

beforeAll(async () => {
  await db.delete(equipmentUsage);
  await db.delete(equipment);
  await db.delete(equipmentItem);
  await db.delete(projects);
  await db.delete(clients);
  await db.delete(users);

  const adminId = randomUUID();
  const surveyorId = randomUUID();
  const clientUserId = randomUUID();

  await db.insert(users).values([
    { id: adminId, name: "Eq Admin", email: "eq-admin@fixture.test", role: "admin" },
    { id: surveyorId, name: "Eq Surveyor", email: "eq-surveyor@fixture.test", role: "surveyor" },
    { id: clientUserId, name: "Eq Client", email: "eq-client@fixture.test", role: "client" },
  ]);

  admin = { id: adminId, name: "Eq Admin", email: "eq-admin@fixture.test", role: "admin" };
  surveyor = {
    id: surveyorId,
    name: "Eq Surveyor",
    email: "eq-surveyor@fixture.test",
    role: "surveyor",
  };
  clientUser = {
    id: clientUserId,
    name: "Eq Client",
    email: "eq-client@fixture.test",
    role: "client",
  };

  const [clientA] = await db
    .insert(clients)
    .values([{ name: "Klien A", type: "individual", userId: clientUserId }])
    .returning();

  const [projectA] = await db
    .insert(projects)
    .values({
      title: "Proyek Klien A",
      clientId: clientA.id,
      surveyType: "kavling",
      assignedSurveyorId: surveyorId,
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

/**
 * Tiap unit butuh item induknya sendiri dulu (spec 2026-07-16) — helper ini
 * membuat SATU item baru dengan SATU unit di bawahnya, kode selalu unik lewat
 * counter modul, supaya test tidak perlu memikirkan tabrakan kode secara manual.
 */
async function createTestUnit(
  overrides: Partial<{
    itemName: string;
    condition: "tersedia" | "perawatan" | "rusak" | "pensiun";
    purchasePrice: number;
    purchaseDate: string;
  }> = {},
) {
  unitSeq += 1;
  const item = await createEquipmentItemForUser(admin, {
    name: overrides.itemName ?? `TS-${unitSeq}`,
    category: "instrumen_ukur",
  });
  return createEquipmentForUser(admin, {
    itemId: item.id,
    code: `UNIT-${unitSeq}`,
    condition: overrides.condition ?? "tersedia",
    purchasePrice: overrides.purchasePrice,
    purchaseDate: overrides.purchaseDate,
  });
}

describe("batas akses", () => {
  it("surveyor tidak bisa menambah alat", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Curang", category: "drone" });
    await expect(
      createEquipmentForUser(surveyor, { itemId: item.id, code: "CURANG-01", condition: "tersedia" }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengubah kondisi alat", async () => {
    const unit = await createTestUnit();
    await expect(
      updateEquipmentForUser(surveyor, {
        equipmentId: unit.id,
        code: unit.code,
        condition: "rusak",
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("surveyor tidak bisa mengarsipkan alat", async () => {
    const unit = await createTestUnit();
    await expect(archiveEquipmentForUser(surveyor, { equipmentId: unit.id })).rejects.toThrow(
      /admin/i,
    );
  });

  // Dikunci pada BENTUK hasil query, bukan pada render — UI bukan batas keamanan.
  it("baris alat yang sampai ke surveyor TIDAK memuat harga & tanggal beli", async () => {
    await createTestUnit({
      itemName: "TS-Harga",
      purchasePrice: 250_000_000,
      purchaseDate: "2025-01-10",
    });

    const rows = await listEquipmentForUser(surveyor);
    const row = rows.find((r) => r.itemName === "TS-Harga");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("purchasePrice");
    expect(row).not.toHaveProperty("purchaseDate");
    expect(JSON.stringify(rows)).not.toContain("250000000");

    const adminRows = await listEquipmentForUser(admin);
    const adminRow = adminRows.find((r) => r.itemName === "TS-Harga") as EquipmentRow | undefined;
    expect(adminRow?.purchasePrice).toBe(250_000_000);
  });

  it("surveyor tidak bisa mencatat pemakaian untuk proyek yang bukan miliknya", async () => {
    const unit = await createTestUnit();
    await expect(
      borrowEquipmentForUser(surveyor, {
        equipmentId: unit.id,
        projectId: otherProjectId,
        startedAt: new Date(),
      }),
    ).rejects.toThrow();
  });

  // Server MEMAKSA usedById = dirinya. Kalau ini cuma tidak dirender di form,
  // request yang dirakit tangan bisa mencatat alat di tangan orang lain.
  it("surveyor yang mengisi usedById orang lain tetap tercatat atas namanya sendiri", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(surveyor, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
      usedById: admin.id, // dicoba
    });

    expect(usage.usedById).toBe(surveyor.id);
    expect(usage.recordedById).toBe(surveyor.id);
  });

  it("admin BOLEH mencatat atas nama surveyor", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
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

describe("kode unit unik", () => {
  it("kode unit yang sudah dipakai unit lain ditolak", async () => {
    const item = await createEquipmentItemForUser(admin, { name: "Dup", category: "drone" });
    await createEquipmentForUser(admin, { itemId: item.id, code: "DUP-01", condition: "tersedia" });
    await expect(
      createEquipmentForUser(admin, { itemId: item.id, code: "DUP-01", condition: "tersedia" }),
    ).rejects.toThrow(/kode/i);
  });
});

describe("aturan pinjam", () => {
  it("alat rusak tidak bisa dipinjam", async () => {
    const unit = await createTestUnit({ condition: "rusak" });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/rusak/i);
  });

  it("alat terarsip tidak bisa dipinjam", async () => {
    const unit = await createTestUnit();
    await archiveEquipmentForUser(admin, { equipmentId: unit.id });
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/arsip/i);
  });

  it("waktu mulai di masa depan ditolak", async () => {
    const unit = await createTestUnit();
    const besok = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: besok }),
    ).rejects.toThrow(/masa depan/i);
  });

  it("meminjam alat yang sudah dipinjam ditolak, dengan menyebut pemegangnya", async () => {
    const unit = await createTestUnit();
    await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    await expect(
      borrowEquipmentForUser(admin, { equipmentId: unit.id, projectId, startedAt: new Date() }),
    ).rejects.toThrow(/sedang dipakai/i);
  });

  it("mengembalikan lalu meminjam lagi BOLEH — kuncinya sesi aktif, bukan seumur hidup", async () => {
    const unit = await createTestUnit();
    const first = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: first.id });

    const second = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
    });
    expect(second.id).not.toBe(first.id);
  });

  it("status pakai adalah TURUNAN: alat dengan sesi terbuka tampil sedang dipakai, setelah dikembalikan tidak lagi", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(),
      usedById: surveyor.id,
    });

    const dipakai = await getEquipmentForUser(admin, unit.id);
    expect(dipakai.activeUsage?.usedById).toBe(surveyor.id);
    expect(dipakai.activeUsage?.projectId).toBe(projectId);

    await returnEquipmentForUser(admin, { usageId: usage.id });

    const bebas = await getEquipmentForUser(admin, unit.id);
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
    const unit = await createTestUnit();

    await db.insert(equipmentUsage).values({
      equipmentId: unit.id,
      projectId,
      usedById: surveyor.id,
      recordedById: admin.id,
      startedAt: new Date(),
    });

    let caught: unknown;
    try {
      await db.insert(equipmentUsage).values({
        equipmentId: unit.id,
        projectId,
        usedById: admin.id,
        recordedById: admin.id,
        startedAt: new Date(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const cause = (caught as { cause?: unknown }).cause;
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    expect(causeMessage).toMatch(/equipment_active_usage_uniq|unique/i);
  });
});

describe("koreksi sesi (admin-only)", () => {
  it("surveyor tidak bisa mengoreksi sesi", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: usage.id });

    await expect(
      correctUsageForUser(surveyor, {
        usageId: usage.id,
        startedAt: new Date(Date.now() - 30 * 60 * 1000),
        endedAt: new Date(),
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("klien tidak bisa mengoreksi sesi", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: usage.id });

    await expect(
      correctUsageForUser(clientUser, {
        usageId: usage.id,
        startedAt: new Date(Date.now() - 30 * 60 * 1000),
        endedAt: new Date(),
      }),
    ).rejects.toThrow(/admin/i);
  });

  it("admin bisa mengoreksi startedAt/endedAt sesi yang sudah ditutup, dan nilainya berubah di DB", async () => {
    const unit = await createTestUnit();
    const originalStart = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: originalStart,
    });
    const originalEnd = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await returnEquipmentForUser(admin, { usageId: usage.id, endedAt: originalEnd });

    const correctedStart = new Date(Date.now() - 90 * 60 * 1000);
    const correctedEnd = new Date(Date.now() - 30 * 60 * 1000);
    const corrected = await correctUsageForUser(admin, {
      usageId: usage.id,
      startedAt: correctedStart,
      endedAt: correctedEnd,
    });

    expect(corrected.startedAt.getTime()).toBe(correctedStart.getTime());
    expect(corrected.endedAt?.getTime()).toBe(correctedEnd.getTime());

    const [rowInDb] = await db.select().from(equipmentUsage).where(eq(equipmentUsage.id, usage.id));
    expect(rowInDb.startedAt.getTime()).toBe(correctedStart.getTime());
    expect(rowInDb.endedAt?.getTime()).toBe(correctedEnd.getTime());
  });

  it("koreksi dengan endedAt <= startedAt ditolak", async () => {
    const unit = await createTestUnit();
    const usage = await borrowEquipmentForUser(admin, {
      equipmentId: unit.id,
      projectId,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    await returnEquipmentForUser(admin, { usageId: usage.id });

    const sameTime = new Date(Date.now() - 30 * 60 * 1000);
    await expect(
      correctUsageForUser(admin, {
        usageId: usage.id,
        startedAt: sameTime,
        endedAt: sameTime,
      }),
    ).rejects.toThrow(/selesai/i);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/equipment.test.ts`
Expected: PASS, all tests green (including the new "kode unit unik" describe block).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/equipment.test.ts
git commit -m "$(cat <<'EOF'
test(equipment): rewrite equipment.test.ts for item+unit shape, add code-uniqueness test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `equipment.ts` server action wrapper (unit detail path moves)

**Files:**
- Modify: `lib/actions/equipment.ts`

**Interfaces:**
- Produces: same exported action names (`createEquipment`, `updateEquipment`, `archiveEquipment`, `borrowEquipment`, `returnEquipment`, `correctUsage`), but `revalidatePath` calls now target `/dashboard/equipment/unit/${id}` instead of `/dashboard/equipment/${id}` (the detail route moves in Task 16).

- [ ] **Step 1: Replace the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  archiveEquipmentForUser,
  borrowEquipmentForUser,
  correctUsageForUser,
  createEquipmentForUser,
  returnEquipmentForUser,
  updateEquipmentForUser,
} from "@/lib/actions/equipment-logic";
import {
  archiveEquipmentInputSchema,
  borrowEquipmentInputSchema,
  correctUsageInputSchema,
  createEquipmentInputSchema,
  returnEquipmentInputSchema,
  updateEquipmentInputSchema,
} from "@/lib/actions/equipment-schemas";
import { adminActionClient, staffActionClient } from "@/lib/actions/safe-action";

/**
 * Server action inventaris alat — UNIT FISIK. Logika + guard ada di
 * `equipment-logic.ts` (diuji langsung); `adminActionClient`/`staffActionClient`
 * di sini adalah penegakan pertama yang terikat request — bukan penggantinya,
 * melainkan lapis pertamanya. `borrowEquipment`/`returnEquipment` memakai
 * `staffActionClient` karena surveyor perlu memanggilnya; sisanya admin-only.
 */

export const createEquipment = adminActionClient
  .inputSchema(createEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await createEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });

export const updateEquipment = adminActionClient
  .inputSchema(updateEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await updateEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${item.id}`);
    return { success: true as const, item };
  });

export const archiveEquipment = adminActionClient
  .inputSchema(archiveEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await archiveEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${item.id}`);
    return { success: true as const, item };
  });

export const borrowEquipment = staffActionClient
  .inputSchema(borrowEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await borrowEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });

export const returnEquipment = staffActionClient
  .inputSchema(returnEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await returnEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });

export const correctUsage = adminActionClient
  .inputSchema(correctUsageInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await correctUsageForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/equipment.ts
git commit -m "$(cat <<'EOF'
feat(equipment): equipment.ts revalidatePath targets moved unit detail route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `equipment-item-form.tsx` + `equipment-item-form-dialog.tsx` (new)

**Files:**
- Create: `components/equipment/equipment-item-form.tsx`
- Create: `components/equipment/equipment-item-form-dialog.tsx`

**Interfaces:**
- Consumes: `createEquipmentItem`/`updateEquipmentItem` (Task 7), `EquipmentImageField` (existing, unchanged), `equipmentCategoryLabel` (existing, unchanged).
- Produces: `EquipmentItemEditTarget` type, `EquipmentItemForm`, `EquipmentItemFormDialog` — consumed by Task 14 (accordion) and Task 15 (page.tsx header "+ Tambah jenis alat").

- [ ] **Step 1: Write `equipment-item-form.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { EquipmentImageField } from "@/components/equipment/equipment-image-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { createEquipmentItem, updateEquipmentItem } from "@/lib/actions/equipment-items";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel } from "@/lib/labels";

type FormValues = { name: string; category: EquipmentCategoryInput };

export type EquipmentItemEditTarget = {
  itemId: string;
  name: string;
  category: EquipmentCategoryInput;
  image: string | null;
  /** URL yang sudah di-resolve untuk pratinjau gambar lama (server: `downloadUrlFor`). */
  imageDisplayUrl: string | null;
};

/**
 * Admin-only: tambah jenis alat baru ATAU edit jenis yang ada (spec
 * 2026-07-16) — pola sama dengan `EquipmentForm` (unit). Unit fisiknya
 * ditambahkan terpisah, dari accordion halaman daftar (`EquipmentFormDialog`
 * dengan `itemId` tetap), bukan dari sini.
 */
export function EquipmentItemForm({
  editing,
  onSuccess,
}: {
  editing?: EquipmentItemEditTarget;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(editing?.image ?? null);
  const isEditing = !!editing;

  const defaultValues: FormValues = {
    name: editing?.name ?? "",
    category: editing?.category ?? "instrumen_ukur",
  };

  const { control, register, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const { executeAsync: executeCreate, isExecuting: isCreating } = useAction(createEquipmentItem);
  const { executeAsync: executeUpdate, isExecuting: isUpdating } = useAction(updateEquipmentItem);
  const isSubmitting = isCreating || isUpdating;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);
    const payload = { name: values.name.trim(), category: values.category, image };

    const result = isEditing
      ? await executeUpdate({ itemId: editing.itemId, ...payload })
      : await executeCreate(payload);

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    reset(defaultValues);
    if (onSuccess) {
      onSuccess();
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-name">Nama jenis alat</Label>
        <Input id="item-name" {...register("name")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Gambar (opsional)</Label>
        <EquipmentImageField
          value={image}
          displayUrl={editing?.imageDisplayUrl ?? null}
          onChange={setImage}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="item-category">Kategori</Label>
        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <SelectField
              id="item-category"
              className="w-full"
              options={optionsFromLabels(equipmentCategoryLabel)}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Tambah jenis alat"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Write `equipment-item-form-dialog.tsx`**

```tsx
"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import {
  type EquipmentItemEditTarget,
  EquipmentItemForm,
} from "@/components/equipment/equipment-item-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Tambah / edit jenis alat dalam dialog (spec 2026-07-16). `editing`
 * menentukan mode, sama seperti `EquipmentFormDialog` (unit).
 */
export function EquipmentItemFormDialog({
  editing,
  trigger,
}: {
  editing?: EquipmentItemEditTarget;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const isEditing = !!editing;

  const defaultTrigger = isEditing ? (
    <Button variant="outline" size="sm">
      Edit
    </Button>
  ) : (
    <Button>Tambah jenis alat</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit jenis alat" : "Jenis alat baru"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? editing.name
              : "Tambahkan jenis alat baru. Unit fisiknya ditambahkan satu-satu setelah tersimpan."}
          </DialogDescription>
        </DialogHeader>
        <EquipmentItemForm editing={editing} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: no new errors from these two files.

- [ ] **Step 4: Commit**

```bash
git add components/equipment/equipment-item-form.tsx components/equipment/equipment-item-form-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(equipment): add EquipmentItemForm/EquipmentItemFormDialog (jenis alat)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Rewrite `equipment-form.tsx` + `equipment-form-dialog.tsx` for unit fields

**Files:**
- Modify: `components/equipment/equipment-form.tsx`
- Modify: `components/equipment/equipment-form-dialog.tsx`

**Interfaces:**
- Consumes: `createEquipment`/`updateEquipment` (Task 11, unchanged names), `equipmentConditionLabel` (existing, unchanged).
- Produces: `EquipmentEditTarget` type now has `code` (not `name`/`category`/`image`). `EquipmentForm`/`EquipmentFormDialog` both take a required `itemId` prop (+ `itemName` on the dialog, for display). Consumed by Task 14 (accordion "+ Tambah unit") and Task 16 (unit detail page edit trigger).

- [ ] **Step 1: Replace `equipment-form.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { createEquipment, updateEquipment } from "@/lib/actions/equipment";
import type { EquipmentConditionInput } from "@/lib/actions/equipment-schemas";
import { equipmentConditionLabel } from "@/lib/labels";

type FormValues = {
  code: string;
  serialNumber: string;
  condition: EquipmentConditionInput;
  purchaseDate: string;
  purchasePrice: string;
  notes: string;
};

export type EquipmentEditTarget = {
  equipmentId: string;
  code: string;
  serialNumber: string | null;
  condition: EquipmentConditionInput;
  purchaseDate: string | null;
  purchasePrice: number | null;
  notes: string | null;
};

/**
 * Admin-only: tambah unit fisik baru di bawah `itemId`, ATAU edit unit yang
 * ada (spec 2026-07-16). Jenis alat (nama/kategori/gambar) tidak ada di sini
 * lagi — itu `EquipmentItemForm`. `itemId` selalu wajib: untuk create dikirim
 * ke server; untuk edit unit tidak pernah pindah item, jadi tidak dikirim
 * ulang, hanya dipakai untuk teks tampilan oleh pemanggil.
 */
export function EquipmentForm({
  itemId,
  editing,
  onSuccess,
}: {
  itemId: string;
  editing?: EquipmentEditTarget;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = !!editing;

  const defaultValues: FormValues = {
    code: editing?.code ?? "",
    serialNumber: editing?.serialNumber ?? "",
    condition: editing?.condition ?? "tersedia",
    purchaseDate: editing?.purchaseDate ?? "",
    purchasePrice: editing?.purchasePrice != null ? String(editing.purchasePrice) : "",
    notes: editing?.notes ?? "",
  };

  const { control, register, handleSubmit, reset } = useForm<FormValues>({ defaultValues });
  const { executeAsync: executeCreate, isExecuting: isCreating } = useAction(createEquipment);
  const { executeAsync: executeUpdate, isExecuting: isUpdating } = useAction(updateEquipment);
  const isSubmitting = isCreating || isUpdating;

  const onSubmit = async (values: FormValues) => {
    setFormError(null);

    let purchasePrice: number | null = null;
    if (values.purchasePrice.trim()) {
      const parsed = Number(values.purchasePrice.trim());
      if (!Number.isInteger(parsed) || parsed < 0) {
        setFormError("Harga beli harus bilangan bulat non-negatif.");
        return;
      }
      purchasePrice = parsed;
    }

    const payload = {
      code: values.code.trim(),
      serialNumber: values.serialNumber.trim() || undefined,
      condition: values.condition,
      purchaseDate: values.purchaseDate || null,
      purchasePrice,
      notes: values.notes.trim() || undefined,
    };

    const result = isEditing
      ? await executeUpdate({ equipmentId: editing.equipmentId, ...payload })
      : await executeCreate({ itemId, ...payload });

    if (result?.serverError) {
      setFormError(result.serverError);
      return;
    }
    if (result?.validationErrors) {
      setFormError("Periksa kembali data yang dimasukkan.");
      return;
    }

    reset(defaultValues);
    if (onSuccess) {
      onSuccess();
    }
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">Kode unit</Label>
        <Input id="code" {...register("code")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="serialNumber">Nomor seri (opsional)</Label>
        <Input id="serialNumber" {...register("serialNumber")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="condition">Kondisi</Label>
        <Controller
          control={control}
          name="condition"
          render={({ field }) => (
            <SelectField
              id="condition"
              className="w-full"
              options={optionsFromLabels(equipmentConditionLabel)}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchaseDate">Tanggal beli (opsional)</Label>
          <Input id="purchaseDate" type="date" {...register("purchaseDate")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="purchasePrice">Harga beli, IDR (opsional)</Label>
          <Input id="purchasePrice" type="number" min={0} step={1} {...register("purchasePrice")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">Catatan (opsional)</Label>
        <Textarea id="notes" rows={3} {...register("notes")} />
      </div>

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <Button type="submit" disabled={isSubmitting} className="mt-2 w-fit">
        {isSubmitting ? "Menyimpan..." : isEditing ? "Simpan perubahan" : "Tambah unit"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Replace `equipment-form-dialog.tsx`**

```tsx
"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import { type EquipmentEditTarget, EquipmentForm } from "@/components/equipment/equipment-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Tambah / edit UNIT dalam dialog (spec 2026-07-16). `itemId`/`itemName`
 * selalu wajib — unit selalu ada di bawah satu jenis alat, baik saat
 * ditambah dari accordion daftar maupun diedit dari halaman detail unit.
 */
export function EquipmentFormDialog({
  itemId,
  itemName,
  editing,
  trigger,
}: {
  itemId: string;
  itemName: string;
  editing?: EquipmentEditTarget;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const isEditing = !!editing;

  const defaultTrigger = isEditing ? (
    <Button variant="outline">Edit</Button>
  ) : (
    <Button>Tambah unit</Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? defaultTrigger} />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit unit" : "Unit baru"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `${itemName} — ${editing.code}`
              : `Tambahkan unit fisik baru untuk ${itemName}.`}
          </DialogDescription>
        </DialogHeader>
        <EquipmentForm itemId={itemId} editing={editing} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: errors remaining only in files not yet touched by this plan (`app/dashboard/equipment/page.tsx`, `app/dashboard/equipment/[id]/page.tsx`, `components/equipment/equipment-table.tsx`, `equipment-columns.tsx`, `equipment-card-list.tsx`, `app/dashboard/projects/[id]/page.tsx`, `lib/db/seed.ts`, `e2e/equipment.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add components/equipment/equipment-form.tsx components/equipment/equipment-form-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(equipment): EquipmentForm/EquipmentFormDialog become unit-only (itemId+code)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: `equipment-item-accordion.tsx` (new) — replaces table/columns/card-list

**Files:**
- Create: `components/equipment/equipment-item-accordion.tsx`
- Delete: `components/equipment/equipment-table.tsx`
- Delete: `components/equipment/equipment-columns.tsx`
- Delete: `components/equipment/equipment-card-list.tsx`

**Interfaces:**
- Consumes: `BorrowDialog`, `ReturnButton` (existing, unchanged), `EquipmentFormDialog` (Task 13), `EquipmentItemFormDialog` (Task 12), `equipmentCategoryLabel`/`equipmentConditionLabel` (existing).
- Produces: `EquipmentUnitRow`, `EquipmentItemAccordionRow`, `EquipmentItemAccordion` — consumed by Task 15 (`page.tsx`). One component replaces desktop table + mobile card list: the accordion layout works at every viewport, so a separate mobile rendering is no longer needed.

- [ ] **Step 1: Write `equipment-item-accordion.tsx`**

```tsx
"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

const conditionVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  tersedia: "secondary",
  perawatan: "outline",
  rusak: "destructive",
  pensiun: "outline",
};

export type EquipmentUnitRow = {
  id: string;
  code: string;
  serialNumber: string | null;
  condition: string;
  purchasePrice?: number | null;
  activeUsage: {
    usedByName: string;
    projectTitle: string;
    usageId: string;
    canReturn: boolean;
    durationLabel: string;
  } | null;
  canBorrow: boolean;
};

export type EquipmentItemAccordionRow = {
  id: string;
  name: string;
  category: string;
  image: string | null;
  units: EquipmentUnitRow[];
  summary: { total: number; tersedia: number; terpinjam: number; perawatan: number; rusak: number };
};

/**
 * Daftar alat sebagai accordion per JENIS (spec 2026-07-16) — menggantikan
 * `EquipmentTable`/`EquipmentColumns`/`EquipmentCardList`. Satu tampilan untuk
 * semua ukuran layar (kartu accordion, bukan tabel 5 kolom yang butuh
 * rendering terpisah untuk mobile). Expand/collapse murni state klien — tidak
 * disimpan di URL.
 */
export function EquipmentItemAccordion({
  items,
  isAdmin,
  projectOptions,
  surveyors,
  emptyMessage,
}: {
  items: EquipmentItemAccordionRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  emptyMessage: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.units.some(
          (u) =>
            u.code.toLowerCase().includes(q) || (u.serialNumber ?? "").toLowerCase().includes(q),
        ),
    );
  }, [items, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari jenis alat, kode, atau no. seri…"
      />

      {filtered.length === 0
        ? emptyMessage
        : filtered.map((it) => {
            const isOpen = expanded.has(it.id);
            return (
              <Card key={it.id} className="flex flex-col gap-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(it.id)}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                      {it.image ? (
                        // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis
                        <img src={it.image} alt={it.name} className="size-full object-cover" />
                      ) : (
                        <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {equipmentCategoryLabel[it.category] ?? it.category}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                        <span>{it.summary.total} total</span>
                        <span>· {it.summary.tersedia} tersedia</span>
                        <span>· {it.summary.terpinjam} dipinjam</span>
                        {it.summary.perawatan > 0 ? <span>· {it.summary.perawatan} perawatan</span> : null}
                        {it.summary.rusak > 0 ? <span>· {it.summary.rusak} rusak</span> : null}
                      </div>
                    </div>
                  </button>
                  {isAdmin ? (
                    <EquipmentItemFormDialog
                      editing={{
                        itemId: it.id,
                        name: it.name,
                        category: it.category as EquipmentCategoryInput,
                        image: it.image,
                        imageDisplayUrl: it.image,
                      }}
                      trigger={
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      }
                    />
                  ) : null}
                </div>

                {isOpen ? (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    {it.units.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada unit.</p>
                    ) : (
                      it.units.map((unit) => (
                        <div
                          key={unit.id}
                          className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/equipment/unit/${unit.id}`}
                              className="font-medium hover:underline"
                            >
                              {unit.code}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {unit.serialNumber ? `SN ${unit.serialNumber}` : "Tanpa no. seri"}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-2 sm:justify-end">
                            {unit.activeUsage ? (
                              <div className="flex min-w-0 flex-col gap-0.5">
                                <Badge className="w-fit">Terpinjam</Badge>
                                <span className="truncate text-xs text-muted-foreground">
                                  {unit.activeUsage.usedByName} · {unit.activeUsage.projectTitle}
                                </span>
                              </div>
                            ) : (
                              <Badge variant={conditionVariant[unit.condition] ?? "secondary"}>
                                {equipmentConditionLabel[unit.condition] ?? unit.condition}
                              </Badge>
                            )}

                            {unit.activeUsage ? (
                              unit.activeUsage.canReturn ? (
                                <ReturnButton
                                  usageId={unit.activeUsage.usageId}
                                  equipmentName={`${it.name} (${unit.code})`}
                                  durationLabel={unit.activeUsage.durationLabel}
                                />
                              ) : null
                            ) : unit.canBorrow ? (
                              <BorrowDialog
                                fixedEquipment={{ id: unit.id, name: `${it.name} (${unit.code})` }}
                                projectOptions={projectOptions}
                                isAdmin={isAdmin}
                                surveyors={surveyors}
                                trigger={
                                  <Button size="sm" variant="outline">
                                    Pinjam
                                  </Button>
                                }
                              />
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}

                    {isAdmin ? (
                      <EquipmentFormDialog
                        itemId={it.id}
                        itemName={it.name}
                        trigger={
                          <Button size="sm" variant="outline" className="w-fit">
                            + Tambah unit
                          </Button>
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
    </div>
  );
}
```

- [ ] **Step 2: Delete the old table/columns/card-list files**

```bash
git rm components/equipment/equipment-table.tsx components/equipment/equipment-columns.tsx components/equipment/equipment-card-list.tsx
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: `app/dashboard/equipment/page.tsx` now errors (still imports the deleted `EquipmentTable`) — fixed in Task 15. Confirm no other new errors.

- [ ] **Step 4: Commit**

```bash
git add components/equipment/equipment-item-accordion.tsx
git commit -m "$(cat <<'EOF'
feat(equipment): add EquipmentItemAccordion, remove EquipmentTable/Columns/CardList

One accordion-based list replaces the separate desktop table + mobile card
list — it renders the same at every viewport, and the per-item grouping
this feature needs doesn't map onto react-table's flat row model anyway.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Rewrite `app/dashboard/equipment/page.tsx`

**Files:**
- Modify: `app/dashboard/equipment/page.tsx`

**Interfaces:**
- Consumes: `listEquipmentItemsForUser` (Task 6), `summarizeUnits` (Task 4), `EquipmentItemAccordion`/`EquipmentItemAccordionRow` (Task 14), `EquipmentItemFormDialog` (Task 12), `EquipmentSummary` (existing, unchanged — still takes plain numbers).
- Produces: the item-grouped list page described in the spec.

- [ ] **Step 1: Replace the file**

```tsx
import { and, eq, isNull } from "drizzle-orm";
import { WrenchIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EquipmentFilters } from "@/components/equipment/equipment-filters";
import {
  EquipmentItemAccordion,
  type EquipmentItemAccordionRow,
} from "@/components/equipment/equipment-item-accordion";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import { EquipmentSummary } from "@/components/equipment/equipment-summary";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listEquipmentItemsForUser } from "@/lib/actions/equipment-items-logic";
import { listProjectsForUser, requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { formatDuration, summarizeUnits, usageDurationMs } from "@/lib/equipment/derive";
import { downloadUrlFor } from "@/lib/storage";

export const metadata = { title: "Inventaris Alat" };

/**
 * Daftar alat, dikelompokkan per JENIS (spec 2026-07-16). `requireStaff()`
 * adalah gerbangnya — klien tidak pernah sampai ke sini.
 *
 * Kolom harga beli hanya masuk payload admin — `listEquipmentItemsForUser`
 * (lewat `listEquipmentForUser`) memangkasnya di level query untuk surveyor,
 * bukan disembunyikan di render.
 */
export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>;
}) {
  const filters = await searchParams;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";

  const itemsWithUnits = await listEquipmentItemsForUser(user);

  const userProjects = await listProjectsForUser(user);
  const projectOptions = userProjects.map((p) => ({ id: p.id, title: p.title }));

  const surveyors = isAdmin
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
    : [];

  // Ringkasan total dihitung SEBELUM filter diterapkan — kartunya sendiri
  // adalah quick-filter, jadi harus tetap menunjukkan total sesungguhnya.
  const overallSummary = summarizeUnits(itemsWithUnits.flatMap((it) => it.units));

  // Filter di level item: item tampil kalau ADA unit yang cocok filter; unit
  // yang tidak cocok tersembunyi di dalam accordion-nya, bukan item-nya yang
  // hilang seluruhnya.
  const filteredItems = itemsWithUnits
    .filter((it) => !filters.category || it.item.category === filters.category)
    .map((it) => ({
      ...it,
      units: it.units.filter((u) => {
        if (!filters.status) return true;
        if (filters.status === "terpinjam") return Boolean(u.activeUsage);
        return !u.activeUsage && u.condition === filters.status;
      }),
    }))
    .filter((it) => !filters.status || it.units.length > 0);

  const now = new Date();
  const rows: EquipmentItemAccordionRow[] = await Promise.all(
    filteredItems.map(async (it) => ({
      id: it.item.id,
      name: it.item.name,
      category: it.item.category,
      image: it.item.image ? await downloadUrlFor(it.item.image) : null,
      summary: summarizeUnits(it.units),
      units: it.units.map((unit) => ({
        id: unit.id,
        code: unit.code,
        serialNumber: unit.serialNumber,
        condition: unit.condition,
        purchasePrice: "purchasePrice" in unit ? unit.purchasePrice : undefined,
        activeUsage: unit.activeUsage
          ? {
              usedByName: unit.activeUsage.usedByName,
              projectTitle: unit.activeUsage.projectTitle,
              usageId: unit.activeUsage.usageId,
              canReturn: isAdmin || unit.activeUsage.usedById === user.id,
              durationLabel: formatDuration(
                usageDurationMs({ startedAt: unit.activeUsage.startedAt, endedAt: null }, now),
              ),
            }
          : null,
        canBorrow: unit.condition === "tersedia" && !unit.activeUsage,
      })),
    })),
  );

  const hasActiveFilter = Boolean(filters.category || filters.status);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Inventaris Alat"
        description={
          user.role === "surveyor"
            ? "Alat ukur yang bisa Anda pinjam."
            : "Seluruh alat ukur studio."
        }
        action={isAdmin ? <EquipmentItemFormDialog /> : undefined}
      />

      <EquipmentSummary
        total={overallSummary.total}
        tersedia={overallSummary.tersedia}
        terpinjam={overallSummary.terpinjam}
        perawatan={overallSummary.perawatan}
        rusak={overallSummary.rusak}
        activeStatus={filters.status ?? ""}
      />

      <EquipmentFilters />

      <EquipmentItemAccordion
        items={rows}
        isAdmin={isAdmin}
        projectOptions={projectOptions}
        surveyors={surveyors}
        emptyMessage={
          <EmptyState
            icon={WrenchIcon}
            title={hasActiveFilter ? "Tidak ada alat yang cocok dengan filter" : "Belum ada alat"}
            description={
              hasActiveFilter
                ? "Coba ubah atau hapus filter yang aktif."
                : isAdmin
                  ? "Tambahkan jenis alat pertama untuk mulai mencatat unit & pemakaiannya."
                  : "Belum ada alat yang terdaftar."
            }
            action={
              isAdmin && !hasActiveFilter ? (
                <EquipmentItemFormDialog trigger={<Button size="sm">Tambah jenis alat</Button>} />
              ) : undefined
            }
          />
        }
      />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: this file's errors are gone. Remaining errors only in `app/dashboard/equipment/[id]/page.tsx`, `app/dashboard/projects/[id]/page.tsx`, `lib/db/seed.ts`, `e2e/equipment.spec.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/equipment/page.tsx
git commit -m "$(cat <<'EOF'
feat(equipment): equipment list page groups units by item with aggregate counts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Move unit detail page to `app/dashboard/equipment/unit/[unitId]/page.tsx`

**Files:**
- Create: `app/dashboard/equipment/unit/[unitId]/page.tsx`
- Delete: `app/dashboard/equipment/[id]/page.tsx`

**Interfaces:**
- Consumes: `getEquipmentForUser`/`listUsageForEquipment` (Task 9, now item-joined shape), `EquipmentFormDialog` (Task 13, now requires `itemId`+`itemName`).
- Produces: the unit detail page at its new route — consumed by links from Task 14 (accordion) and Task 17 (project page usage history links, unchanged path shape since those already point at `/dashboard/equipment/${equipmentId}` and need updating too, see Task 17).

- [ ] **Step 1: Write the new file**

```tsx
import { and, eq, inArray, isNull } from "drizzle-orm";
import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { ArchiveEquipmentButton } from "@/components/equipment/archive-equipment-button";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { UsageHistory, type UsageHistoryRow } from "@/components/equipment/usage-history";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEquipmentForUser, listUsageForEquipment } from "@/lib/actions/equipment-logic";
import type { EquipmentConditionInput } from "@/lib/actions/equipment-schemas";
import { listProjectsForUser, requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projects, users } from "@/lib/db/schema";
import { formatDuration, usageDurationMs } from "@/lib/equipment/derive";
import { formatIDR } from "@/lib/format";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";
import { downloadUrlFor } from "@/lib/storage";

export async function generateMetadata({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const user = await requireStaff();
  const item = await getEquipmentForUser(user, unitId);
  return { title: `${item.itemName} — ${item.code}` };
}

/**
 * Detail SATU UNIT fisik + riwayat pakai (spec 2026-07-16, evolusi dari
 * `[id]/page.tsx`). `requireStaff()` adalah gerbang halaman ini — klien tidak
 * pernah sampai kemari.
 *
 * Harga & tanggal beli hanya dirender kalau `"purchasePrice" in item` — yang
 * hanya benar untuk payload admin (`getEquipmentForUser` memangkas dua field
 * itu dari bentuk objeknya sendiri untuk surveyor, bukan cuma
 * menyembunyikannya di UI).
 */
export default async function EquipmentUnitDetailPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const user = await requireStaff();
  const isAdmin = user.role === "admin";

  const item = await getEquipmentForUser(user, unitId);
  const usages = await listUsageForEquipment(user, unitId);
  const imageDisplayUrl = item.image ? await downloadUrlFor(item.image) : null;

  const userProjects = await listProjectsForUser(user);
  const projectOptions = userProjects.map((p) => ({ id: p.id, title: p.title }));
  const surveyors = isAdmin
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.role, "surveyor"), isNull(users.archivedAt)))
    : [];
  const canReturnActive =
    item.activeUsage !== null && (isAdmin || item.activeUsage.usedById === user.id);

  const projectIds = [...new Set(usages.map((u) => u.projectId))];
  const userIds = [...new Set(usages.map((u) => u.usedById))];

  const [projectRows, userRows] = await Promise.all([
    projectIds.length
      ? db
          .select({ id: projects.id, title: projects.title })
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : Promise.resolve([]),
    userIds.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
  ]);
  const projectTitleById = new Map(projectRows.map((p) => [p.id, p.title]));
  const userNameById = new Map(userRows.map((u) => [u.id, u.name]));

  const now = new Date();
  const usageRows: UsageHistoryRow[] = usages.map((usage) => ({
    id: usage.id,
    projectId: usage.projectId,
    projectTitle: projectTitleById.get(usage.projectId) ?? "—",
    usedByName: userNameById.get(usage.usedById) ?? "—",
    startedAt: usage.startedAt,
    endedAt: usage.endedAt,
    // Durasi dihitung di SERVER — bukan di komponen klien, supaya tidak ada
    // mismatch hidrasi antara jam render server dan jam browser.
    duration: formatDuration(usageDurationMs(usage, now)),
    note: usage.note,
    canReturn: usage.endedAt === null && (isAdmin || usage.usedById === user.id),
  }));

  const activeDuration = item.activeUsage
    ? formatDuration(usageDurationMs({ startedAt: item.activeUsage.startedAt, endedAt: null }, now))
    : null;

  const displayName = `${item.itemName} (${item.code})`;

  return (
    <main className="flex flex-col gap-6 p-8">
      <Link href="/dashboard/equipment" className="text-sm text-muted-foreground hover:underline">
        ← Kembali ke daftar alat
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium">{displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {equipmentCategoryLabel[item.category] ?? item.category}
            {item.serialNumber ? ` · SN ${item.serialNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {equipmentConditionLabel[item.condition] ?? item.condition}
          </Badge>
          {isAdmin && !item.archivedAt ? (
            <>
              <EquipmentFormDialog
                itemId={item.itemId}
                itemName={item.itemName}
                editing={{
                  equipmentId: item.id,
                  code: item.code,
                  serialNumber: item.serialNumber,
                  condition: item.condition as EquipmentConditionInput,
                  purchaseDate: "purchaseDate" in item ? item.purchaseDate : null,
                  purchasePrice: "purchasePrice" in item ? item.purchasePrice : null,
                  notes: item.notes,
                }}
              />
              <ArchiveEquipmentButton equipmentId={item.id} equipmentName={displayName} />
            </>
          ) : null}
        </div>
      </div>

      <div className="flex h-48 w-full max-w-sm items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {imageDisplayUrl ? (
          // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis yang bisa dioptimasi
          <img src={imageDisplayUrl} alt={item.itemName} className="h-full w-full object-contain" />
        ) : (
          <ImageIcon className="h-10 w-10 text-muted-foreground" aria-hidden />
        )}
      </div>

      {item.archivedAt ? (
        <p className="text-sm text-muted-foreground">Alat ini sudah diarsipkan.</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Status pakai</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {item.activeUsage ? (
            <>
              <p className="text-sm">
                Sedang dipakai oleh{" "}
                <span className="font-medium">{item.activeUsage.usedByName}</span> untuk proyek{" "}
                <span className="font-medium">{item.activeUsage.projectTitle}</span> · berjalan{" "}
                {activeDuration}
              </p>
              {canReturnActive ? (
                <ReturnButton
                  usageId={item.activeUsage.usageId}
                  equipmentName={displayName}
                  durationLabel={activeDuration ?? undefined}
                />
              ) : null}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Tersedia — tidak sedang dipakai.</p>
              {item.condition === "tersedia" && !item.archivedAt ? (
                <BorrowDialog
                  fixedEquipment={{ id: item.id, name: displayName }}
                  projectOptions={projectOptions}
                  isAdmin={isAdmin}
                  surveyors={surveyors}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {"purchasePrice" in item ? (
        <Card>
          <CardHeader>
            <CardTitle>Data pembelian</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Tanggal beli</p>
              <p className="text-sm">{item.purchaseDate ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Harga beli</p>
              <p className="text-sm">{formatIDR(item.purchasePrice)}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {item.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Catatan</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{item.notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Riwayat pakai</CardTitle>
        </CardHeader>
        <CardContent>
          <UsageHistory rows={usageRows} equipmentName={displayName} />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Delete the old detail page**

```bash
git rm app/dashboard/equipment/[id]/page.tsx
rmdir "app/dashboard/equipment/[id]" 2>/dev/null || true
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: this file's errors gone. Remaining: `app/dashboard/projects/[id]/page.tsx`, `lib/db/seed.ts`, `e2e/equipment.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/equipment/unit/[unitId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(equipment): move unit detail page to /dashboard/equipment/unit/[unitId]

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Update project detail page + `ProjectEquipment` for the new label/route

**Files:**
- Modify: `app/dashboard/projects/[id]/page.tsx`
- Modify: `components/equipment/project-equipment.tsx`

**Interfaces:**
- Consumes: `listEquipmentForUser` (Task 9, rows now have `itemName`/`code` instead of `name`).
- Produces: the "Alat" tab's equipment picker and history rows show `"${itemName} (${code})"`; the history row link points at `/dashboard/equipment/unit/${equipmentId}` (Task 16's new route).

- [ ] **Step 1: Update `app/dashboard/projects/[id]/page.tsx`**

Find (around line 136-165):

```ts
  const projectEquipmentUsages = await listUsageForProject(user, project.id);
  const allEquipment = await listEquipmentForUser(user);
  const equipmentNameById = new Map(allEquipment.map((e) => [e.id, e.name]));
```

and

```ts
  // Boleh dipinjam: tersedia, tidak terarsip, dan tidak sedang dipakai —
  // dihitung di server dari `listEquipmentForUser`, sama seperti spec Task 6.
  const borrowableEquipment = allEquipment
    .filter((e) => e.condition === "tersedia" && !e.archivedAt && !e.activeUsage)
    .map((e) => ({ id: e.id, name: e.name }));
```

Replace both with:

```ts
  const projectEquipmentUsages = await listUsageForProject(user, project.id);
  const allEquipment = await listEquipmentForUser(user);
  // "${itemName} (${code})" — beberapa unit sejenis kini mungkin ada (spec
  // 2026-07-16), jadi nama alat saja tidak lagi cukup membedakan unit mana.
  const equipmentNameById = new Map(
    allEquipment.map((e) => [e.id, `${e.itemName} (${e.code})`]),
  );
```

and

```ts
  // Boleh dipinjam: tersedia, tidak terarsip, dan tidak sedang dipakai —
  // dihitung di server dari `listEquipmentForUser`.
  const borrowableEquipment = allEquipment
    .filter((e) => e.condition === "tersedia" && !e.archivedAt && !e.activeUsage)
    .map((e) => ({ id: e.id, name: `${e.itemName} (${e.code})` }));
```

- [ ] **Step 2: Update `components/equipment/project-equipment.tsx`**

Find:

```tsx
                    <TableCell>
                      <Link
                        href={`/dashboard/equipment/${row.equipmentId}`}
                        className="font-medium hover:underline"
                      >
                        {row.equipmentName}
                      </Link>
                    </TableCell>
```

Replace with:

```tsx
                    <TableCell>
                      <Link
                        href={`/dashboard/equipment/unit/${row.equipmentId}`}
                        className="font-medium hover:underline"
                      >
                        {row.equipmentName}
                      </Link>
                    </TableCell>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: both files' errors gone. Remaining: `lib/db/seed.ts`, `e2e/equipment.spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add "app/dashboard/projects/[id]/page.tsx" components/equipment/project-equipment.tsx
git commit -m "$(cat <<'EOF'
feat(equipment): project page equipment picker/history use itemName+code, moved unit route

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Update `lib/db/seed.ts` for items + multi-unit example

**Files:**
- Modify: `lib/db/seed.ts`

**Interfaces:**
- Consumes: `equipmentItem` table (Task 3), `equipment` insert shape (Task 3).
- Produces: 5 `equipmentItem` rows, 7 `equipment` units (GPS RTK and Waterpass each get 2 units — demonstrating the "some available, some borrowed" aggregate the feature exists for), 3 `equipmentUsage` rows (2 open, 1 closed).

- [ ] **Step 1: Add `equipmentItem` to the imports and teardown**

Find the schema import line that includes `equipment,` and `equipmentUsage,` (near the top of the file) and add `equipmentItem,` alongside it.

Find the teardown block:

```ts
    await db.delete(equipmentUsage);
    await db.delete(equipment);
```

Replace with:

```ts
    await db.delete(equipmentUsage);
    await db.delete(equipment);
    await db.delete(equipmentItem);
```

(Order matters: `equipment.itemId` references `equipmentItem`, restrict — units must go before items.)

- [ ] **Step 2: Replace the equipment insert block**

Find the block starting at `// Inventaris alat (spec 2026-07-14). ...` through the `equipmentUsage` insert that follows it (the block that creates `totalStation1, totalStation2, gpsRtk, drone, waterpass` and two usage rows). Replace the whole thing with:

```ts
  // Inventaris alat (spec 2026-07-14, direvisi spec 2026-07-16): jenis alat
  // (equipmentItem) + unit fisik (equipment) di bawahnya. GPS RTK dan
  // Waterpass sengaja diberi 2 unit masing-masing supaya agregat
  // tersedia/dipinjam per jenis langsung kelihatan di demo — satu dari dua
  // unit GPS RTK sedang dipinjam, sisanya tersedia.
  const [tsGm52, tsCx105, gpsRtk, drone, waterpass] = await db
    .insert(equipmentItem)
    .values([
      { name: "Total Station Topcon GM-52", category: "instrumen_ukur" },
      { name: "Total Station Sokkia CX-105", category: "instrumen_ukur" },
      { name: "GPS RTK Trimble R12", category: "gps_rtk" },
      { name: "Drone DJI Phantom 4 RTK", category: "drone" },
      { name: "Waterpass Sokkia B40A", category: "instrumen_ukur" },
    ])
    .returning();

  const [tsGm52Unit, tsCx105Unit, gpsRtkUnit1, gpsRtkUnit2, droneUnit, waterpassUnit1, waterpassUnit2] =
    await db
      .insert(equipment)
      .values([
        {
          itemId: tsGm52.id,
          code: "TS-GM52-01",
          serialNumber: "TS-GM52-001",
          condition: "tersedia",
          purchaseDate: "2024-03-10",
          purchasePrice: 85_000_000,
        },
        {
          itemId: tsCx105.id,
          code: "TS-CX105-01",
          serialNumber: "TS-CX105-002",
          condition: "perawatan",
          notes: "Layar retak, dikirim servis ke pusat Sokkia.",
          purchaseDate: "2022-11-05",
          purchasePrice: 65_000_000,
        },
        {
          itemId: gpsRtk.id,
          code: "RTK-R12-01",
          serialNumber: "RTK-R12-001",
          condition: "tersedia",
          purchaseDate: "2025-01-20",
          purchasePrice: 120_000_000,
        },
        {
          itemId: gpsRtk.id,
          code: "RTK-R12-02",
          serialNumber: "RTK-R12-002",
          condition: "tersedia",
          purchaseDate: "2025-03-01",
          purchasePrice: 120_000_000,
        },
        {
          itemId: drone.id,
          code: "DRN-P4RTK-01",
          serialNumber: "DRN-P4RTK-001",
          condition: "rusak",
          notes: "Baling-baling patah, menunggu spare part.",
          purchaseDate: "2023-07-15",
          purchasePrice: 95_000_000,
        },
        {
          itemId: waterpass.id,
          code: "WP-B40A-01",
          serialNumber: "WP-B40A-001",
          condition: "tersedia",
          purchaseDate: "2021-09-01",
          purchasePrice: 12_000_000,
        },
        {
          itemId: waterpass.id,
          code: "WP-B40A-02",
          serialNumber: "WP-B40A-002",
          condition: "tersedia",
          purchaseDate: "2022-05-01",
          purchasePrice: 12_000_000,
        },
      ])
      .returning();

  // Tiga sesi pakai demo: dua MASIH BERJALAN (satu di Total Station, satu di
  // salah satu dari dua unit GPS RTK — supaya "1 tersedia, 1 dipinjam" jadi
  // kelihatan langsung tanpa perlu meminjam manual di demo), satu sudah
  // ditutup (supaya durasi tertutup juga kelihatan di riwayat).
  await db.insert(equipmentUsage).values([
    {
      equipmentId: tsGm52Unit.id,
      projectId: topografi.id,
      usedById: surveyor2Id,
      startedAt: new Date("2026-07-15T02:00:00Z"),
      endedAt: null,
      note: "Pengukuran ulang poligon tahap 2.",
      recordedById: surveyor2Id,
    },
    {
      equipmentId: gpsRtkUnit2.id,
      projectId: kavling.id,
      usedById: surveyor1Id,
      startedAt: new Date("2026-07-15T04:00:00Z"),
      endedAt: null,
      note: "Pengukuran RTK titik kontrol.",
      recordedById: surveyor1Id,
    },
    {
      equipmentId: waterpassUnit1.id,
      projectId: kavling.id,
      usedById: surveyor1Id,
      startedAt: new Date("2026-07-10T01:00:00Z"),
      endedAt: new Date("2026-07-10T05:30:00Z"),
      note: "Cek elevasi blok C.",
      recordedById: surveyor1Id,
    },
  ]);
```

- [ ] **Step 3: Update the final `console.log` summary**

Find:

```ts
  console.log("seed OK:", {
    users: 4,
    clients: 3,
    projects: inserted.length,
    statusLogs: 11,
    phases: 3,
    equipment: [totalStation1, totalStation2, gpsRtk, drone, waterpass].length,
  });
```

Replace with:

```ts
  console.log("seed OK:", {
    users: 4,
    clients: 3,
    projects: inserted.length,
    statusLogs: 11,
    phases: 3,
    equipmentItems: 5,
    equipmentUnits: [
      tsGm52Unit,
      tsCx105Unit,
      gpsRtkUnit1,
      gpsRtkUnit2,
      droneUnit,
      waterpassUnit1,
      waterpassUnit2,
    ].length,
  });
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: this file's errors gone. Remaining: `e2e/equipment.spec.ts` only.

- [ ] **Step 5: Reset and re-seed the dev DB to verify**

Run: `pnpm db:seed:reset`
Expected: exits 0, prints `seed OK: { ..., equipmentItems: 5, equipmentUnits: 7 }`.

- [ ] **Step 6: Commit**

```bash
git add lib/db/seed.ts
git commit -m "$(cat <<'EOF'
feat(seed): equipment seed data uses equipmentItem+equipment, GPS RTK/Waterpass get 2 units

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 19: Rewrite `e2e/equipment.spec.ts`

**Files:**
- Modify: `e2e/equipment.spec.ts`

**Interfaces:**
- Consumes: the whole UI stack from Tasks 12-17 — this is the end-to-end check that item creation, unit creation, borrow, and return all work together through the browser.

- [ ] **Step 1: Replace the file**

```ts
import { expect, test } from "@playwright/test";

/**
 * Inventaris alat — quantity per item (spec 2026-07-16). Alur: admin login →
 * `/dashboard/equipment` → tambah JENIS alat → expand item → tambah UNIT →
 * buka proyek → tab Alat → pinjam unit → assert badge item berubah jadi "1
 * dipinjam" → kembalikan dari halaman detail unit → assert durasi muncul di
 * riwayat.
 *
 * Nama item dan kode unit diberi akhiran `Date.now()` (pola yang sama dengan
 * `project-phases.spec.ts`) supaya spec ini IDEMPOTEN.
 */
const suffix = Date.now();
const itemName = `E2E Total Station ${suffix}`;
const unitCode = `E2E-TS-${suffix}`;

test.describe("Inventaris alat — quantity per item (2026-07-16)", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("tambah jenis alat, tambah unit, pinjam di proyek, kembalikan, durasi tampil", async ({
    page,
  }) => {
    // 1. Tambah jenis alat baru lewat dialog di halaman inventaris.
    await page.goto("/dashboard/equipment");
    await page.getByRole("button", { name: "Tambah jenis alat" }).click();

    const itemDialog = page.getByRole("dialog", { name: "Jenis alat baru" });
    await itemDialog.locator("#item-name").fill(itemName);
    await itemDialog.getByRole("button", { name: "Tambah jenis alat" }).click();

    await expect(page.getByText(itemName)).toBeVisible();

    // 2. Expand item yang baru dibuat, tambah unit dengan kode unik.
    await page.getByText(itemName).click();
    await page.getByRole("button", { name: "+ Tambah unit" }).click();

    const unitDialog = page.getByRole("dialog", { name: "Unit baru" });
    await unitDialog.locator("#code").fill(unitCode);
    await unitDialog.locator("#serialNumber").fill(`SN-${suffix}`);
    await unitDialog.getByRole("button", { name: "Tambah unit" }).click();

    await expect(page.getByRole("link", { name: unitCode })).toBeVisible();
    await expect(page.getByText("1 total")).toBeVisible();

    // 3. Buka proyek, tab Alat, pinjam unit yang baru dibuat. Pemilih alat
    //    adalah Combobox (dialog cari-sendiri), bukan <select> native, dan
    //    labelnya "${itemName} (${unitCode})".
    const equipmentLabel = `${itemName} (${unitCode})`;

    await page.goto("/dashboard/projects");
    await page
      .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
      .first()
      .click();

    await page.getByRole("tab", { name: "Alat" }).click();
    await page.getByRole("button", { name: "Pinjam alat" }).click();

    await page.getByRole("button", { name: "Pilih alat…" }).click();
    const alatPicker = page.getByRole("dialog", { name: "Pilih alat" });
    await alatPicker.getByPlaceholder("Cari alat…").fill(equipmentLabel);
    await alatPicker.getByRole("button", { name: equipmentLabel }).click();
    await page.getByRole("button", { name: "Pinjam", exact: true }).click();

    // Dialog tertutup, baris muncul di tabel riwayat tab Alat dengan nama
    // pemegang (admin meminjam untuk dirinya sendiri, tidak mengisi "dipakai
    // oleh").
    await expect(page.getByRole("cell", { name: equipmentLabel })).toBeVisible();
    await expect(page.getByText("Sedang dipakai")).toBeVisible();

    // 4. Assert badge item di daftar inventaris berubah jadi "1 dipinjam".
    await page.goto("/dashboard/equipment");
    await page.getByText(itemName).click();
    await expect(page.getByText("1 dipinjam")).toBeVisible();

    // 5. Kembalikan, dari halaman detail unit. Tombol "Kembalikan" membuka
    //    dialog konfirmasi lebih dulu (ada di kartu Status pakai), lalu
    //    dikonfirmasi.
    await page.getByRole("link", { name: unitCode }).click();
    await expect(page.getByText(/Sedang dipakai oleh/)).toBeVisible();
    await page.getByRole("button", { name: "Kembalikan" }).first().click();
    const returnConfirm = page.getByRole("dialog", { name: "Kembalikan alat?" });
    await returnConfirm.getByRole("button", { name: "Kembalikan" }).click();

    // 6. Assert durasi muncul di riwayat, dan unit sudah tidak lagi "Dipakai".
    await expect(page.getByText("Tersedia — tidak sedang dipakai.")).toBeVisible();
    const historyRow = page
      .getByRole("row")
      .filter({ hasText: "Pengukuran batas tanah Cimahi" })
      .last();
    await expect(historyRow.getByText(/menit|jam|hari/)).toBeVisible();
  });
});
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASSES with zero errors — this was the last file with lingering errors from Task 3 onward.

- [ ] **Step 3: Run the e2e spec**

Requires `next dev` running on :3000 against the dev DB (per `CLAUDE.md`: `pnpm e2e` reuses an existing server, runs serially). Start the dev server in one terminal if not already running (`pnpm dev`), then:

Run: `pnpm e2e -- e2e/equipment.spec.ts`
Expected: PASS. If a selector doesn't match (e.g. `page.getByText(itemName)` matches more than one element because the badge summary text also contains the item name's substring), narrow it — e.g. wrap the match in `.first()`, or add a stable `data-testid` to the item row's name in `equipment-item-accordion.tsx` and select on that instead. Fix locally in this test file; no other file needs to change for this.

- [ ] **Step 4: Commit**

```bash
git add e2e/equipment.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): rewrite equipment spec for item->unit creation flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 20: Full verification pass

**Files:** none (verification only)

**Interfaces:** none — this task confirms every prior task's work holds together.

- [ ] **Step 1: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: zero errors. If Biome flags anything in files this plan touched, fix with `pnpm lint:fix` and re-run.

- [ ] **Step 3: Full vitest suite**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run`
Expected: all files pass, including `lib/equipment/derive.test.ts`, `lib/actions/equipment-items.test.ts`, `lib/actions/equipment.test.ts`, and every other pre-existing test file (unaffected by this feature — confirms nothing else broke, e.g. `payments.test.ts`/`phases.test.ts`/`documents.test.ts` if they exist alongside).

- [ ] **Step 4: Full Playwright suite**

With `pnpm dev` running against the dev DB:

Run: `pnpm e2e`
Expected: all specs pass, including `e2e/equipment.spec.ts` (Task 19) and every other pre-existing spec (confirms the moved route `/dashboard/equipment/unit/[unitId]` and the label changes didn't break any other flow that happens to touch equipment, e.g. a project-detail spec that also exercises the "Alat" tab).

- [ ] **Step 5: Manual smoke check in the browser**

With `pnpm dev` running, log in as admin and walk through:
1. `/dashboard/equipment` — confirm the seeded items (Task 18) render as an accordion: "GPS RTK Trimble R12" shows "2 total · 1 tersedia · 1 dipinjam" without expanding.
2. Expand it — confirm both units (`RTK-R12-01` tersedia, `RTK-R12-02` terpinjam) show with a working "Pinjam"/link-to-detail respectively.
3. Click into `RTK-R12-01`'s detail page — confirm the "← Kembali ke daftar alat" link, image, condition badge, and (as admin) edit/archive buttons all render.
4. As a surveyor account (if one exists in the seed), confirm `purchasePrice`/`purchaseDate` are absent from both the accordion and the unit detail page.
5. Log in as a client account — confirm `/dashboard/equipment` is unreachable (redirects, per `requireStaff`).

No code changes expected from this step — it's a final confirmation that the feature works end-to-end beyond what automated tests cover (visual layout, accordion expand/collapse feel, role-based field hiding as actually rendered).

- [ ] **Step 6: Report completion**

Summarize to the user what was built (schema migration, item/unit split, accordion UI, seed data) and point at the spec (`docs/superpowers/specs/2026-07-16-inventaris-quantity-unit-design.md`) and this plan for reference. Do not create a PR or push unless the user asks.

---

