# RBAC Core Engine + Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun engine RBAC granular di `lib/rbac/` — grant = (permission, scope), permission didefinisikan di kode, role disimpan di DB — tanpa mengubah satu pun perilaku aplikasi yang ada.

**Architecture:** Tiap resource punya satu file di `lib/rbac/resources/` yang mendeklarasikan `actions`, `scopes` (predikat SQL Drizzle), `guards`, dan `fields`. Registry menggabungkannya jadi katalog permission bertipe union. Empat fungsi publik dipakai konsumen: `can()` (aksi), `rbacFilter()` (daftar, selalu mengembalikan `SQL`), `requireScopedRow()` (satu baris, memakai filter yang sama), `redact()` (field). Permission efektif user di-load sekali per request lewat `getRbacContext()` yang dibungkus React `cache()`.

**Tech Stack:** TypeScript, Drizzle ORM (node-postgres), Postgres (Neon), Vitest, Zod, Next.js 16 (`react`'s `cache`, `next/navigation`'s `notFound`).

**Spec:** `docs/superpowers/specs/2026-07-21-rbac-core-engine-design.md`

## Global Constraints

- **Nol perubahan perilaku.** Tidak ada call site lama yang disentuh. `requireRole`, `requireAdmin`, `requireStaff`, `adminActionClient`, `staffActionClient` tetap ada dan tetap dipakai. Seluruh test lama harus hijau **tanpa diubah**.
- **Resource nyata TIDAK mendeklarasikan `guards` maupun `fields`.** Engine mendukung keduanya dan mengetesnya lewat resource fixture; mengisinya untuk resource nyata adalah pekerjaan sub-proyek 2.
- **Tidak ada aturan deny.** Ketiadaan grant sudah berarti tidak boleh.
- **Test hit Neon dev branch yang nyata** (`.env.local`), bukan mock. **Jangan pernah** menjalankan test atau seed terhadap `.env.prod`.
- **`fileParallelism: false`** sudah aktif; setup data tiap file test harus self-contained.
- Nama permission **selalu tepat dua segmen**: `resource.action`. Tanpa wildcard, tanpa nesting.
- Urutan scope: `all > assigned > own`.
- Komentar kode dan pesan error yang dilihat user ditulis dalam **bahasa Indonesia**, mengikuti konvensi codebase.
- Gaya kode Biome: indentasi 2 spasi, tanda kutip ganda, lebar baris 100. Jalankan `pnpm lint:fix` sebelum commit kalau ragu.
- **Validasi Zod terhadap katalog ditunda ke sub-proyek 4.** Spec §4 menyebut
  permission divalidasi Zod "di boundary tulis" — di sub-proyek 1 belum ada
  boundary tulis (tidak ada UI, tidak ada action). `isPermission()` sudah
  menyediakan predikatnya; membungkusnya jadi skema Zod baru dilakukan saat
  ada yang memakainya.
- Perintah menjalankan satu file test:
  `node --env-file=.env.local node_modules/vitest/vitest.mjs run <path>`

---

## File Structure

| File | Tanggung jawab |
|---|---|
| `lib/db/schema.ts` (modify) | Tambah enum `roleArea`, `permissionScope`; tabel `roles`, `rolePermissions`, `userRoles`; relations |
| `lib/rbac/types.ts` | `Scope`, `SCOPES`, `highestScope()`, `RbacContext` |
| `lib/rbac/define-resource.ts` | `defineResource()` + tipe `ResourceDefinition`, `ScopeFn`, `GuardFn` |
| `lib/rbac/resources/via-project.ts` | Helper `viaProject()` — scope turunan lewat relasi `projectId` |
| `lib/rbac/resources/project.ts` … `report.ts` | 11 resource, satu file masing-masing |
| `lib/rbac/resources/index.ts` | Registry `RESOURCES`, tipe `Permission` / `ScopedPermission`, `PERMISSIONS`, `isPermission()`, `resourceOf()` |
| `lib/rbac/system-roles.ts` | Matrix 3 system role + `seedSystemRoles()` + `backfillUserRoles()` |
| `lib/rbac/context.ts` | `loadEffectivePermissions()`, `getRbacContext()` |
| `lib/rbac/can.ts` | `can()`, `scopeOf()`, `assertCan()` |
| `lib/rbac/filter.ts` | `rbacFilter()` |
| `lib/rbac/scoped-row.ts` | `requireScopedRow()` |
| `lib/rbac/fields.ts` | `redact()` |
| `lib/rbac/test-fixtures.ts` | Resource fixture untuk menguji `guards` + `fields` tanpa menyentuh resource nyata |
| `lib/db/seed.ts` (modify) | Panggil `seedSystemRoles()` + `backfillUserRoles()` |

---

### Task 1: Schema + migrasi tabel RBAC

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `lib/rbac/schema.test.ts`
- Create (generated): `drizzle/XXXX_*.sql`

**Interfaces:**
- Consumes: tabel `users` yang sudah ada di `lib/db/schema.ts`
- Produces: `roleArea`, `permissionScope`, `roles`, `rolePermissions`, `userRoles` — semuanya diekspor dari `@/lib/db/schema`

- [ ] **Step 1: Tambahkan enum di `lib/db/schema.ts`**

Sisipkan tepat setelah baris `export const equipmentCondition = pgEnum(...)` (blok enum, sekitar baris 60-67):

```ts
/* RBAC (spec 2026-07-21). `permission` sengaja BUKAN pgEnum — katalognya hidup
 * di lib/rbac/resources/, jadi menambah fitur tidak boleh butuh migrasi DB. */
export const roleArea = pgEnum("role_area", ["staff", "client"]);
export const permissionScope = pgEnum("permission_scope", ["all", "assigned", "own"]);
```

- [ ] **Step 2: Tambahkan tabel di `lib/db/schema.ts`**

Sisipkan di akhir file, setelah definisi `auditLog`:

```ts
/* -------------------------------------------------------------------------- */
/* RBAC (spec 2026-07-21)                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Role = baris DB, bukan enum. Tiga role bawaan di-seed dengan `isSystem`
 * true dan tidak boleh dihapus — `proxy.ts` dan area /portal bergantung
 * padanya. Role tidak di-soft-delete (beda dengan users/clients/equipment)
 * karena tidak ada FK riwayat yang menunjuk ke sini.
 */
export const roles = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  // Menentukan area landing (/dashboard vs /portal). `users.role` tetap ada
  // sebagai petunjuk kasar untuk proxy.ts, yang tidak boleh query DB.
  area: roleArea("area").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Satu grant = satu izin + jangkauan barisnya. */
export const rolePermissions = pgTable(
  "role_permission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    scope: permissionScope("scope").notNull().default("own"),
  },
  (t) => [uniqueIndex("role_permission_uniq").on(t.roleId, t.permission)],
);

/** Multi-role: izin efektif user = gabungan seluruh role-nya. */
export const userRoles = pgTable(
  "user_role",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export const rolesRelations = relations(roles, ({ many }) => ({
  permissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, { fields: [rolePermissions.roleId], references: [roles.id] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
  role: one(roles, { fields: [userRoles.roleId], references: [roles.id] }),
}));
```

- [ ] **Step 3: Tambahkan `primaryKey` ke import drizzle**

Di blok import `drizzle-orm/pg-core` paling atas `lib/db/schema.ts`, tambahkan `primaryKey` (urut alfabet, setelah `pgTable`):

```ts
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 4: Generate migrasi**

Run: `pnpm db:generate`
Expected: file baru di `drizzle/` berisi `CREATE TYPE "public"."role_area"`, `CREATE TYPE "public"."permission_scope"`, dan `CREATE TABLE "role"` / `"role_permission"` / `"user_role"`.

- [ ] **Step 5: Terapkan migrasi ke dev DB**

Run: `pnpm db:migrate`
Expected: selesai tanpa error. (Jangan pernah `db:migrate:prod` di sini.)

- [ ] **Step 6: Tulis test yang gagal**

Create `lib/rbac/schema.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";

/**
 * Membuktikan constraint tabel RBAC benar-benar ada di DB, bukan cuma di
 * schema.ts: unik per (role, permission) dan cascade saat role dihapus.
 * Fixture-nya memakai key/email ber-suffix acak sehingga tidak bentrok dengan
 * data seed dan tidak perlu menghapus tabel milik file test lain.
 */

const suffix = randomUUID().slice(0, 8);
const roleKey = `fixture-role-${suffix}`;
const userId = `fixture-user-${suffix}`;
let roleId: string;

beforeAll(async () => {
  const [role] = await db
    .insert(roles)
    .values({ key: roleKey, name: "Fixture Role", area: "staff" })
    .returning();
  roleId = role.id;

  await db.insert(users).values({
    id: userId,
    name: "Fixture User",
    email: `${userId}@fixture.test`,
    role: "surveyor",
  });
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(roles).where(eq(roles.id, roleId));
});

describe("tabel RBAC", () => {
  it("menyimpan grant sebagai (permission, scope)", async () => {
    await db
      .insert(rolePermissions)
      .values({ roleId, permission: "project.read", scope: "assigned" });

    const rows = await db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    expect(rows).toHaveLength(1);
    expect(rows[0].permission).toBe("project.read");
    expect(rows[0].scope).toBe("assigned");
  });

  it("menolak permission ganda dalam satu role", async () => {
    await expect(
      db.insert(rolePermissions).values({ roleId, permission: "project.read", scope: "all" }),
    ).rejects.toThrow();
  });

  it("memberi satu user banyak role", async () => {
    const [second] = await db
      .insert(roles)
      .values({ key: `${roleKey}-2`, name: "Fixture Role 2", area: "staff" })
      .returning();

    await db.insert(userRoles).values([
      { userId, roleId },
      { userId, roleId: second.id },
    ]);

    const rows = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(rows).toHaveLength(2);

    // Menghapus role ikut menghapus penugasan & grant-nya (cascade).
    await db.delete(roles).where(eq(roles.id, second.id));
    const after = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(after).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/schema.test.ts`
Expected: PASS (3 test). Kalau gagal dengan `relation "role" does not exist`, migrasi Step 5 belum jalan.

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts drizzle/ lib/rbac/schema.test.ts
git commit -m "feat(rbac): tabel role, role_permission, user_role"
```

---

### Task 2: `types.ts` + `defineResource()`

**Files:**
- Create: `lib/rbac/types.ts`
- Create: `lib/rbac/define-resource.ts`
- Create: `lib/rbac/define-resource.test.ts`

**Interfaces:**
- Consumes: `SessionUser` dari `@/lib/auth-guards`
- Produces:
  - `Scope = "all" | "assigned" | "own"`, `SCOPES`, `highestScope(a, b): Scope`
  - `RbacContext = { user: SessionUser; permissions: ReadonlyMap<string, Scope>; clientId: string | null }`
  - `ScopeFn = (ctx: RbacContext) => SQL`
  - `defineResource(def)` → `def & { permissions: readonly \`${Name}.${Action}\`[] }`

- [ ] **Step 1: Tulis test yang gagal**

Create `lib/rbac/define-resource.test.ts`:

```ts
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { defineResource } from "@/lib/rbac/define-resource";
import { highestScope } from "@/lib/rbac/types";

describe("highestScope", () => {
  it("memilih scope terluas", () => {
    expect(highestScope("own", "all")).toBe("all");
    expect(highestScope("all", "own")).toBe("all");
    expect(highestScope("own", "assigned")).toBe("assigned");
    expect(highestScope("assigned", "assigned")).toBe("assigned");
  });
});

describe("defineResource", () => {
  it("menurunkan daftar permission dari nama + actions", () => {
    const resource = defineResource({
      name: "demo",
      actions: ["read", "write"],
      scopes: { all: () => sql`true` },
    });

    expect(resource.permissions).toEqual(["demo.read", "demo.write"]);
  });

  it("menolak action ganda", () => {
    expect(() =>
      defineResource({ name: "demo", actions: ["read", "read"] }),
    ).toThrow(/action ganda/i);
  });

  it("menolak nama resource yang mengandung titik", () => {
    expect(() => defineResource({ name: "de.mo", actions: ["read"] })).toThrow(/titik/i);
  });

  it("menolak action yang mengandung titik", () => {
    expect(() => defineResource({ name: "demo", actions: ["re.ad"] })).toThrow(/titik/i);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/define-resource.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rbac/define-resource'`

- [ ] **Step 3: Tulis `lib/rbac/types.ts`**

```ts
import type { SQL } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";

/**
 * Jangkauan baris sebuah grant. Urutannya bermakna: `all` mencakup
 * `assigned`, yang mencakup `own`. Dipakai saat menggabungkan izin dari
 * banyak role — lihat `highestScope`.
 */
export const SCOPES = ["all", "assigned", "own"] as const;
export type Scope = (typeof SCOPES)[number];

const SCOPE_RANK: Record<Scope, number> = { own: 0, assigned: 1, all: 2 };

/** Scope terluas di antara dua scope. Union multi-role memakai ini. */
export function highestScope(a: Scope, b: Scope): Scope {
  return SCOPE_RANK[a] >= SCOPE_RANK[b] ? a : b;
}

/**
 * Segalanya yang dibutuhkan untuk memutuskan akses dalam satu request.
 *
 * `clientId` ikut di sini — BUKAN di-fetch di dalam fungsi scope — karena
 * fungsi scope harus sinkron: ia menyusun predikat SQL, bukan menjalankan
 * query. Kalau nanti ada nilai lain yang perlu di-fetch untuk menyusun
 * predikat, ia ikut ke sini juga.
 */
export type RbacContext = {
  user: SessionUser;
  /** Kunci berupa string biasa supaya `types.ts` tidak mengimpor registry. */
  permissions: ReadonlyMap<string, Scope>;
  /** `clients.id` yang tertaut ke user portal ini, atau null. */
  clientId: string | null;
};

/** Menyusun predikat SQL untuk satu scope. WAJIB sinkron. */
export type ScopeFn = (ctx: RbacContext) => SQL;
```

- [ ] **Step 4: Tulis `lib/rbac/define-resource.ts`**

```ts
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Scope, ScopeFn } from "./types";

/**
 * Verdict sebuah guard: `true` kalau boleh, atau pesan penolakan berbahasa
 * Indonesia yang akan ditampilkan ke user apa adanya.
 */
export type GuardVerdict = true | string;

type Row<T extends PgTable> = T["$inferSelect"];

export type ResourceDefinition<
  Name extends string,
  Action extends string,
  T extends PgTable,
> = {
  /** Segmen pertama nama permission. Tidak boleh mengandung titik. */
  name: Name;
  /** Segmen kedua. Tidak boleh mengandung titik, tidak boleh ganda. */
  actions: readonly Action[];
  /**
   * Tabel + kolom id-nya. Wajib kalau resource ini mau dipakai lewat
   * `rbacFilter` / `requireScopedRow`; resource "tanpa tabel" seperti
   * `profile` dan `report` hanya dipakai lewat `can()`.
   */
  table?: { table: T; id: PgColumn };
  /**
   * Arti tiap scope sebagai predikat SQL. Scope yang tidak didefinisikan =
   * tidak ada akses (fail-closed), BUKAN akses penuh.
   */
  scopes?: Partial<Record<Scope, ScopeFn>>;
  /** Kondisi per-status yang dicek `requireScopedRow` setelah baris diambil. */
  guards?: Partial<Record<Action, (row: Row<T>) => GuardVerdict>>;
  /** Kolom sensitif → permission yang dibutuhkan untuk melihatnya. */
  fields?: Partial<Record<keyof Row<T> & string, `${Name}.${Action}`>>;
};

export type Resource<
  Name extends string = string,
  Action extends string = string,
  T extends PgTable = PgTable,
> = ResourceDefinition<Name, Action, T> & {
  readonly permissions: readonly `${Name}.${Action}`[];
};

/**
 * Bentuk resource setelah tipenya dilupakan — dipakai engine (`resourceOf`,
 * `rbacFilter`, `requireScopedRow`, `redact`) yang menerima resource apa pun.
 *
 * `guards` sengaja memakai `row: any` di sini: dengan `strictFunctionTypes`,
 * `(row: Project) => …` TIDAK assignable ke `(row: PgTable["$inferSelect"]) => …`
 * (parameter bersifat kontravarian), jadi tanpa ini setiap resource nyata
 * gagal dilewatkan ke engine-nya sendiri.
 */
// biome-ignore lint/suspicious/noExplicitAny: lihat komentar di atas.
type AnyGuard = (row: any) => GuardVerdict;

export type AnyResource = {
  name: string;
  actions: readonly string[];
  table?: { table: PgTable; id: PgColumn };
  scopes?: Partial<Record<Scope, ScopeFn>>;
  guards?: Record<string, AnyGuard>;
  fields?: Record<string, string>;
  readonly permissions: readonly string[];
};

/**
 * Mendeklarasikan satu resource. Validasinya jalan saat modul dimuat, jadi
 * kesalahan penamaan meledak saat start — bukan diam-diam jadi permission
 * yang tidak pernah cocok saat request.
 */
export function defineResource<
  const Name extends string,
  const Action extends string,
  T extends PgTable,
>(def: ResourceDefinition<Name, Action, T>): Resource<Name, Action, T> {
  if (def.name.includes(".")) {
    throw new Error(`rbac: nama resource "${def.name}" tidak boleh mengandung titik.`);
  }

  const seen = new Set<string>();
  for (const action of def.actions) {
    if (action.includes(".")) {
      throw new Error(`rbac: action "${def.name}.${action}" tidak boleh mengandung titik.`);
    }
    if (seen.has(action)) {
      throw new Error(`rbac: action ganda "${action}" di resource "${def.name}".`);
    }
    seen.add(action);
  }

  const permissions = def.actions.map((action) => `${def.name}.${action}` as const);
  return { ...def, permissions };
}
```

- [ ] **Step 5: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/define-resource.test.ts`
Expected: PASS (6 test)

- [ ] **Step 6: Commit**

```bash
git add lib/rbac/types.ts lib/rbac/define-resource.ts lib/rbac/define-resource.test.ts
git commit -m "feat(rbac): tipe inti + defineResource"
```

---

### Task 3: 11 resource + registry

**Files:**
- Create: `lib/rbac/resources/via-project.ts`
- Create: `lib/rbac/resources/{project,client,phase,map,document,payment,equipment,equipment-item,user,profile,report}.ts`
- Create: `lib/rbac/resources/index.ts`
- Create: `lib/rbac/resources/index.test.ts`

**Interfaces:**
- Consumes: `defineResource` (Task 2), tabel dari `@/lib/db/schema`
- Produces:
  - `RESOURCES` — objek `as const` berisi 11 resource
  - `Permission` — union seluruh string permission
  - `ScopedPermission` — subset permission milik resource yang punya `table`
  - `PERMISSIONS: readonly Permission[]`, `isPermission(value): value is Permission`
  - `resourceOf(permission): Resource`
  - `projectScopes` (dari `project.ts`) dan `viaProject(column, scopeFn)` (dari `via-project.ts`)

- [ ] **Step 1: Tulis test yang gagal**

Create `lib/rbac/resources/index.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PERMISSIONS, RESOURCES, isPermission, resourceOf } from "@/lib/rbac/resources";

describe("registry resource", () => {
  it("memuat 11 resource", () => {
    expect(Object.keys(RESOURCES)).toHaveLength(11);
  });

  it("nama kunci registry sama dengan nama resource-nya", () => {
    for (const [key, resource] of Object.entries(RESOURCES)) {
      expect(resource.name).toBe(key);
    }
  });

  it("setiap permission unik dan berbentuk resource.action", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
    for (const permission of PERMISSIONS) {
      expect(permission.split(".")).toHaveLength(2);
    }
  });

  it("mengenali permission yang ada di katalog", () => {
    expect(isPermission("project.read")).toBe(true);
    expect(isPermission("document.share")).toBe(true);
    expect(isPermission("project.raed")).toBe(false);
    expect(isPermission("nonsense")).toBe(false);
  });

  it("resourceOf mengembalikan resource pemilik permission", () => {
    expect(resourceOf("payment.void").name).toBe("payment");
  });

  it("setiap resource bertabel mendefinisikan scope 'all'", () => {
    for (const resource of Object.values(RESOURCES)) {
      if (!resource.table) continue;
      expect(resource.scopes?.all, `${resource.name} tanpa scope all`).toBeTypeOf("function");
    }
  });

  it("resource tanpa tabel tidak mendefinisikan scope sama sekali", () => {
    for (const resource of Object.values(RESOURCES)) {
      if (resource.table) continue;
      expect(resource.scopes, `${resource.name}`).toBeUndefined();
    }
  });

  it("belum ada resource nyata yang memakai guards atau fields (sub-proyek 2)", () => {
    for (const resource of Object.values(RESOURCES)) {
      expect(resource.guards, `${resource.name}.guards`).toBeUndefined();
      expect(resource.fields, `${resource.name}.fields`).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/resources/index.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rbac/resources'`

- [ ] **Step 3: Tulis `lib/rbac/resources/project.ts`**

```ts
import { and, eq, exists, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectPhases, projects } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import type { ScopeFn } from "../types";

/**
 * Aturan scope proyek — SATU-SATUNYA tempat aturan ini ditulis.
 *
 * Diekspor terpisah karena resource lain (fase, peta, dokumen, pembayaran)
 * menurunkan scope-nya dari sini lewat `viaProject`. Tanpa itu, aturan
 * "surveyor melihat proyek yang ditugaskan padanya" akan tersalin ke lima
 * tempat dan mulai melenceng — persis bug yang diwanti-wanti komentar di
 * `lib/auth-guards.ts`.
 */
export const projectScopes: Record<"all" | "assigned" | "own", ScopeFn> = {
  all: () => sql`true`,

  // Ditugaskan langsung ke proyek, ATAU ke salah satu fasenya (spec
  // 2026-07-14). `exists` bukan join supaya proyek dengan dua fase milik
  // orang yang sama tidak muncul dua kali.
  assigned: (ctx) =>
    or(
      eq(projects.assignedSurveyorId, ctx.user.id),
      exists(
        db
          .select({ one: sql`1` })
          .from(projectPhases)
          .where(
            and(
              eq(projectPhases.projectId, projects.id),
              eq(projectPhases.assignedSurveyorId, ctx.user.id),
            ),
          ),
      ),
    ) as ReturnType<ScopeFn>,

  // User portal yang belum tertaut ke baris client menghasilkan himpunan
  // kosong. Sengaja BUKAN sentinel string: `clients.id` bertipe uuid, jadi
  // membandingkannya dengan string non-UUID membuat Postgres melempar
  // `invalid input syntax for type uuid`, bukan mengembalikan nol baris.
  own: (ctx) => (ctx.clientId ? eq(projects.clientId, ctx.clientId) : sql`false`),
};

export const projectResource = defineResource({
  name: "project",
  actions: ["read", "create", "update", "assignSurveyor", "changeStatus", "updateFinance"],
  table: { table: projects, id: projects.id },
  scopes: projectScopes,
});
```

- [ ] **Step 4: Tulis `lib/rbac/resources/via-project.ts`**

```ts
import { and, eq, exists, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import type { ScopeFn } from "../types";

/**
 * Menurunkan scope sebuah tabel anak dari scope proyek induknya.
 *
 * `projectIdColumn` adalah kolom `project_id` milik tabel anak; subquery-nya
 * berkorelasi dengannya, jadi predikat yang dihasilkan bisa langsung dipakai
 * di `where` tabel anak.
 */
export function viaProject(projectIdColumn: PgColumn, projectScope: ScopeFn): ScopeFn {
  return (ctx) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(projects)
        .where(and(eq(projects.id, projectIdColumn), projectScope(ctx))),
    ) as ReturnType<ScopeFn>;
}
```

- [ ] **Step 5: Tulis lima resource turunan proyek**

Create `lib/rbac/resources/phase.ts`:

```ts
import { projectPhases } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

export const phaseResource = defineResource({
  name: "phase",
  actions: ["read", "create", "update", "delete", "reorder", "setStatus", "updateNote"],
  table: { table: projectPhases, id: projectPhases.id },
  // Akses fase mengikuti akses proyek induknya — termasuk aturan "ditugaskan
  // ke salah satu fase memberi akses ke seluruh proyek".
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(projectPhases.projectId, projectScopes.assigned),
    own: viaProject(projectPhases.projectId, projectScopes.own),
  },
});
```

Create `lib/rbac/resources/map.ts`:

```ts
import { mapLayers } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

export const mapResource = defineResource({
  name: "map",
  actions: ["read", "write"],
  table: { table: mapLayers, id: mapLayers.id },
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(mapLayers.projectId, projectScopes.assigned),
    own: viaProject(mapLayers.projectId, projectScopes.own),
  },
});
```

Create `lib/rbac/resources/document.ts`:

```ts
import { and, eq } from "drizzle-orm";
import { documents } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import type { ScopeFn } from "../types";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

const ownProjectDocuments = viaProject(documents.projectId, projectScopes.own);

/**
 * Client hanya melihat dokumen proyeknya yang SUDAH dibagikan. Syarat
 * tambahan itu tinggal di dalam fungsi scope resource ini — bukan jadi
 * konsep baru di engine.
 */
const ownScope: ScopeFn = (ctx) =>
  and(ownProjectDocuments(ctx), eq(documents.sharedWithClient, true)) as ReturnType<ScopeFn>;

export const documentResource = defineResource({
  name: "document",
  actions: ["read", "upload", "share", "delete"],
  table: { table: documents, id: documents.id },
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(documents.projectId, projectScopes.assigned),
    own: ownScope,
  },
});
```

Create `lib/rbac/resources/payment.ts`:

```ts
import { payments } from "@/lib/db/schema";
import { defineResource } from "../define-resource";
import { projectScopes } from "./project";
import { viaProject } from "./via-project";

export const paymentResource = defineResource({
  name: "payment",
  actions: ["read", "record", "void", "regenerateReceipt"],
  table: { table: payments, id: payments.id },
  scopes: {
    all: projectScopes.all,
    assigned: viaProject(payments.projectId, projectScopes.assigned),
    own: viaProject(payments.projectId, projectScopes.own),
  },
});
```

- [ ] **Step 6: Tulis empat resource ber-tabel yang berdiri sendiri**

Create `lib/rbac/resources/client.ts`:

```ts
import { sql } from "drizzle-orm";
import { clients } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/**
 * Manajemen klien admin-only (PRD §3 Feature 1). Hanya scope `all` yang
 * didefinisikan — memberi grant ber-scope `assigned`/`own` ke resource ini
 * menghasilkan himpunan kosong, bukan akses penuh (fail-closed).
 */
export const clientResource = defineResource({
  name: "client",
  actions: ["read", "create", "update", "archive"],
  table: { table: clients, id: clients.id },
  scopes: { all: () => sql`true` },
});
```

Create `lib/rbac/resources/equipment.ts`:

```ts
import { sql } from "drizzle-orm";
import { equipment } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/**
 * Inventaris tidak per-proyek: surveyor melihat SELURUH alat, bukan hanya
 * alat proyeknya. Itu terekspresikan sebagai grant ber-scope `all` untuk
 * role surveyor, bukan sebagai pengecualian di engine.
 */
export const equipmentResource = defineResource({
  name: "equipment",
  actions: ["read", "create", "update", "archive", "borrow", "return", "correctUsage"],
  table: { table: equipment, id: equipment.id },
  scopes: { all: () => sql`true` },
});
```

Create `lib/rbac/resources/equipment-item.ts`:

```ts
import { sql } from "drizzle-orm";
import { equipmentItem } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/** Model/tipe alat. Membacanya ditanggung `equipment.read`. */
export const equipmentItemResource = defineResource({
  name: "equipmentItem",
  actions: ["create", "update", "archive"],
  table: { table: equipmentItem, id: equipmentItem.id },
  scopes: { all: () => sql`true` },
});
```

Create `lib/rbac/resources/user.ts`:

```ts
import { sql } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

export const userResource = defineResource({
  name: "user",
  actions: ["read", "create", "update", "setRole", "archive", "restore"],
  table: { table: users, id: users.id },
  scopes: { all: () => sql`true` },
});
```

- [ ] **Step 7: Tulis dua resource tanpa tabel**

Create `lib/rbac/resources/profile.ts`:

```ts
import { defineResource } from "../define-resource";

/**
 * Tanpa tabel: aksinya selalu menyasar baris user yang sedang login, jadi
 * tidak ada yang perlu di-scope. Hanya dipakai lewat `can()`.
 */
export const profileResource = defineResource({
  name: "profile",
  actions: ["updateOwn"],
});
```

Create `lib/rbac/resources/report.ts`:

```ts
import { defineResource } from "../define-resource";

/** Ekspor laporan (PDF/Excel). Tanpa tabel — hanya dipakai lewat `can()`. */
export const reportResource = defineResource({
  name: "report",
  actions: ["export"],
});
```

- [ ] **Step 8: Tulis `lib/rbac/resources/index.ts`**

```ts
import type { AnyResource } from "../define-resource";
import { clientResource } from "./client";
import { documentResource } from "./document";
import { equipmentItemResource } from "./equipment-item";
import { equipmentResource } from "./equipment";
import { mapResource } from "./map";
import { paymentResource } from "./payment";
import { phaseResource } from "./phase";
import { profileResource } from "./profile";
import { projectResource } from "./project";
import { reportResource } from "./report";
import { userResource } from "./user";

/**
 * Registry seluruh resource. MENAMBAH FITUR = menambah satu file di folder
 * ini lalu mendaftarkannya di sini. Tidak ada file engine lain yang perlu
 * disentuh, dan tipe `Permission` ikut bertambah dengan sendirinya.
 */
export const RESOURCES = {
  project: projectResource,
  client: clientResource,
  phase: phaseResource,
  map: mapResource,
  document: documentResource,
  payment: paymentResource,
  equipment: equipmentResource,
  equipmentItem: equipmentItemResource,
  user: userResource,
  profile: profileResource,
  report: reportResource,
} as const;

export type ResourceName = keyof typeof RESOURCES;

/** Union seluruh permission. Typo seperti "project.raed" gagal saat compile. */
export type Permission = {
  [K in ResourceName]: (typeof RESOURCES)[K]["permissions"][number];
}[ResourceName];

/**
 * Permission milik resource yang punya tabel — satu-satunya yang boleh masuk
 * ke `rbacFilter` / `requireScopedRow`. Memakai `profile.updateOwn` di sana
 * adalah error tipe, bukan error runtime.
 */
export type ScopedPermission = {
  [K in ResourceName]: (typeof RESOURCES)[K] extends { table: object }
    ? (typeof RESOURCES)[K]["permissions"][number]
    : never;
}[ResourceName];

export const PERMISSIONS: readonly Permission[] = Object.values(RESOURCES).flatMap(
  (resource) => resource.permissions as readonly Permission[],
);

const PERMISSION_SET = new Set<string>(PERMISSIONS);

// Registry divalidasi SEKALI saat modul dimuat, bukan tiap request: nama
// resource ganda harus meledak saat start, bukan diam-diam menimpa entri lain.
if (PERMISSION_SET.size !== PERMISSIONS.length) {
  throw new Error("rbac: ada permission ganda di registry.");
}
for (const [key, resource] of Object.entries(RESOURCES)) {
  if (resource.name !== key) {
    throw new Error(`rbac: kunci registry "${key}" tidak cocok dengan nama "${resource.name}".`);
  }
}

/** Apakah string ini permission yang dikenal katalog? Dipakai fail-closed. */
export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

const BY_RESOURCE_NAME = RESOURCES as unknown as Record<string, AnyResource>;

/** Resource pemilik sebuah permission. */
export function resourceOf(permission: Permission): AnyResource {
  const [name] = permission.split(".");
  const resource = BY_RESOURCE_NAME[name];
  if (!resource) throw new Error(`rbac: resource "${name}" tidak terdaftar.`);
  return resource;
}
```

- [ ] **Step 9: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/resources/index.test.ts`
Expected: PASS (8 test)

- [ ] **Step 10: Typecheck**

Run: `pnpm typecheck`
Expected: keluar tanpa error.

- [ ] **Step 11: Commit**

```bash
git add lib/rbac/resources/
git commit -m "feat(rbac): 11 resource + registry katalog permission"
```

---

### Task 4: Matrix system role + seed

**Files:**
- Create: `lib/rbac/system-roles.ts`
- Create: `lib/rbac/system-roles.test.ts`
- Modify: `lib/db/seed.ts`

**Interfaces:**
- Consumes: `PERMISSIONS`, `Permission` (Task 3); tabel `roles`, `rolePermissions`, `userRoles`, `users`
- Produces:
  - `SYSTEM_ROLES` — metadata 3 role bawaan
  - `SYSTEM_ROLE_GRANTS: Record<SystemRoleKey, Partial<Record<Permission, Scope>>>`
  - `seedSystemRoles(): Promise<void>` — idempoten
  - `backfillUserRoles(): Promise<void>` — idempoten

- [ ] **Step 1: Tulis test yang gagal**

Create `lib/rbac/system-roles.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";
import { PERMISSIONS } from "@/lib/rbac/resources";
import { SYSTEM_ROLE_GRANTS, backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import type { Scope } from "@/lib/rbac/types";

/**
 * Matrix parity ditulis ULANG di sini, bukan diimpor dari sumbernya —
 * mengimpornya berarti test cuma membandingkan konstanta dengan dirinya
 * sendiri. Kalau seseorang mengubah grant, test menunjuk sel persisnya.
 */
const EXPECTED_SURVEYOR: Record<string, Scope> = {
  "project.read": "assigned",
  "project.changeStatus": "assigned",
  "phase.read": "assigned",
  "phase.setStatus": "assigned",
  "phase.updateNote": "assigned",
  "map.read": "assigned",
  "map.write": "assigned",
  "document.read": "assigned",
  "document.upload": "assigned",
  "equipment.read": "all",
  "equipment.borrow": "all",
  "equipment.return": "all",
  "profile.updateOwn": "own",
};

const EXPECTED_CLIENT: Record<string, Scope> = {
  "project.read": "own",
  "phase.read": "own",
  "map.read": "own",
  "document.read": "own",
  "payment.read": "own",
  "profile.updateOwn": "own",
};

const userId = `fixture-backfill-${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  await seedSystemRoles();
  await db.insert(users).values({
    id: userId,
    name: "Fixture Backfill",
    email: `${userId}@fixture.test`,
    role: "surveyor",
  });
  await backfillUserRoles();
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
});

async function grantsOf(key: string): Promise<Record<string, Scope>> {
  const rows = await db
    .select({ permission: rolePermissions.permission, scope: rolePermissions.scope })
    .from(roles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .where(eq(roles.key, key));
  return Object.fromEntries(rows.map((r) => [r.permission, r.scope]));
}

describe("seed system role", () => {
  it("membuat 3 role bawaan ber-flag isSystem", async () => {
    const rows = await db.select().from(roles).where(eq(roles.isSystem, true));
    expect(rows.map((r) => r.key).sort()).toEqual(["admin", "client", "surveyor"]);
    expect(rows.find((r) => r.key === "client")?.area).toBe("client");
    expect(rows.find((r) => r.key === "surveyor")?.area).toBe("staff");
  });

  it("admin punya SETIAP permission di katalog", async () => {
    const grants = await grantsOf("admin");
    expect(Object.keys(grants).sort()).toEqual([...PERMISSIONS].sort());
  });

  it("admin ber-scope all kecuali profile.updateOwn yang own", async () => {
    const grants = await grantsOf("admin");
    expect(grants["profile.updateOwn"]).toBe("own");
    for (const [permission, scope] of Object.entries(grants)) {
      if (permission === "profile.updateOwn") continue;
      expect(scope, permission).toBe("all");
    }
  });

  it("surveyor persis sesuai matrix", async () => {
    expect(await grantsOf("surveyor")).toEqual(EXPECTED_SURVEYOR);
  });

  it("client persis sesuai matrix", async () => {
    expect(await grantsOf("client")).toEqual(EXPECTED_CLIENT);
  });

  it("hanya memberi grant yang ada di katalog kode", () => {
    for (const grants of Object.values(SYSTEM_ROLE_GRANTS)) {
      for (const permission of Object.keys(grants)) {
        expect(PERMISSIONS, permission).toContain(permission);
      }
    }
  });

  it("idempoten — dijalankan dua kali tidak menggandakan apa pun", async () => {
    const before = await grantsOf("surveyor");
    await seedSystemRoles();
    await backfillUserRoles();
    expect(await grantsOf("surveyor")).toEqual(before);
  });
});

describe("backfillUserRoles", () => {
  it("memberi user role sesuai kolom users.role lamanya", async () => {
    const rows = await db
      .select({ key: roles.key })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));
    expect(rows.map((r) => r.key)).toEqual(["surveyor"]);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/system-roles.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rbac/system-roles'`

- [ ] **Step 3: Tulis `lib/rbac/system-roles.ts`**

```ts
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";
import { PERMISSIONS, type Permission } from "./resources";
import type { Scope } from "./types";

export type SystemRoleKey = "admin" | "surveyor" | "client";

/**
 * Tiga role bawaan. `isSystem` true berarti tidak boleh dihapus atau
 * di-rename lewat UI (sub-proyek 4) — `proxy.ts` dan area /portal bergantung
 * pada key-nya.
 */
export const SYSTEM_ROLES: readonly {
  key: SystemRoleKey;
  name: string;
  description: string;
  area: "staff" | "client";
}[] = [
  {
    key: "admin",
    name: "Admin",
    description: "Akses penuh ke seluruh data dan pengaturan.",
    area: "staff",
  },
  {
    key: "surveyor",
    name: "Surveyor",
    description: "Mengerjakan proyek yang ditugaskan padanya.",
    area: "staff",
  },
  {
    key: "client",
    name: "Klien",
    description: "Melihat proyeknya sendiri lewat portal, hanya baca.",
    area: "client",
  },
];

/**
 * Admin memegang SELURUH katalog dengan scope `all` — kecuali
 * `profile.updateOwn`, yang menurut namanya memang hanya menyasar dirinya
 * sendiri. Ditulis sebagai turunan katalog, bukan daftar manual, supaya
 * permission baru tidak pernah lupa diberikan ke admin.
 */
const adminGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  PERMISSIONS.map((permission) => [
    permission,
    permission === "profile.updateOwn" ? "own" : "all",
  ]),
);

/**
 * Matrix parity (spec 2026-07-21). Harus menghasilkan perilaku IDENTIK
 * dengan cek role yang tersebar di codebase sekarang — dibuktikan
 * `lib/rbac/parity.test.ts`.
 */
export const SYSTEM_ROLE_GRANTS: Record<SystemRoleKey, Partial<Record<Permission, Scope>>> = {
  admin: adminGrants,

  surveyor: {
    "project.read": "assigned",
    "project.changeStatus": "assigned",
    "phase.read": "assigned",
    "phase.setStatus": "assigned",
    "phase.updateNote": "assigned",
    "map.read": "assigned",
    "map.write": "assigned",
    "document.read": "assigned",
    "document.upload": "assigned",
    // Inventaris tidak per-proyek: surveyor melihat dan meminjam SEMUA alat.
    "equipment.read": "all",
    "equipment.borrow": "all",
    "equipment.return": "all",
    "profile.updateOwn": "own",
  },

  client: {
    "project.read": "own",
    "phase.read": "own",
    "map.read": "own",
    "document.read": "own",
    "payment.read": "own",
    "profile.updateOwn": "own",
  },
};

/**
 * Membuat/menyegarkan 3 role bawaan beserta grant-nya. Idempoten: aman
 * dijalankan berkali-kali, dan menjalankannya ulang setelah menambah
 * permission baru akan menambahkannya ke admin.
 */
export async function seedSystemRoles(): Promise<void> {
  for (const role of SYSTEM_ROLES) {
    const [row] = await db
      .insert(roles)
      .values({
        key: role.key,
        name: role.name,
        description: role.description,
        area: role.area,
        isSystem: true,
      })
      .onConflictDoUpdate({
        target: roles.key,
        set: { name: role.name, description: role.description, area: role.area, isSystem: true },
      })
      .returning({ id: roles.id });

    // Grant ditulis ulang seluruhnya, bukan di-merge: matrix di kode adalah
    // sumber kebenaran untuk role BAWAAN, jadi grant yang sudah dihapus dari
    // matrix harus benar-benar hilang dari DB.
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, row.id));

    const grants = Object.entries(SYSTEM_ROLE_GRANTS[role.key]);
    if (grants.length > 0) {
      await db.insert(rolePermissions).values(
        grants.map(([permission, scope]) => ({
          roleId: row.id,
          permission,
          scope: scope as Scope,
        })),
      );
    }
  }
}

/**
 * Mengisi `user_role` dari kolom `users.role` yang lama — satu baris per
 * user. Idempoten lewat `onConflictDoNothing`, dan sengaja TIDAK menghapus
 * penugasan lain: user yang sudah diberi role tambahan tidak boleh
 * kehilangannya hanya karena seed dijalankan ulang.
 */
export async function backfillUserRoles(): Promise<void> {
  const roleRows = await db
    .select({ id: roles.id, key: roles.key })
    .from(roles)
    .where(inArray(roles.key, ["admin", "surveyor", "client"]));
  const idByKey = new Map(roleRows.map((r) => [r.key, r.id]));

  const userRows = await db.select({ id: users.id, role: users.role }).from(users);
  const values = userRows
    .map((u) => ({ userId: u.id, roleId: idByKey.get(u.role) }))
    .filter((v): v is { userId: string; roleId: string } => Boolean(v.roleId));

  if (values.length === 0) return;
  await db.insert(userRoles).values(values).onConflictDoNothing();
}
```

- [ ] **Step 4: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/system-roles.test.ts`
Expected: PASS (8 test)

- [ ] **Step 5: Sambungkan ke seed dev**

Di `lib/db/seed.ts`, tambahkan import di bagian atas file:

```ts
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
```

Di dalam blok `if (force) { ... }`, tambahkan penghapusan tabel RBAC **sebelum** `await db.delete(users)` (FK-safe — `user_role` menunjuk ke `user`):

```ts
    await db.delete(userRoles);
    await db.delete(rolePermissions);
    await db.delete(roles);
```

Tambahkan `rolePermissions`, `roles`, `userRoles` ke daftar import dari `./schema` di file yang sama.

Lalu di akhir fungsi `seed()`, tepat sebelum `console.log` penutup / `process.exit(0)`, tambahkan:

```ts
  // Role RBAC di-seed BELAKANGAN: `backfillUserRoles` membaca seluruh baris
  // `user`, jadi ia harus jalan setelah user demo dibuat.
  await seedSystemRoles();
  await backfillUserRoles();
```

- [ ] **Step 6: Jalankan seed dan verifikasi**

Run: `pnpm db:seed:reset`
Expected: selesai tanpa error.

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/system-roles.test.ts`
Expected: PASS (8 test) — sekarang di atas DB yang baru di-seed ulang.

- [ ] **Step 7: Commit**

```bash
git add lib/rbac/system-roles.ts lib/rbac/system-roles.test.ts lib/db/seed.ts
git commit -m "feat(rbac): matrix 3 system role + seed idempoten"
```

---

### Task 5: `context.ts` — memuat permission efektif

**Files:**
- Create: `lib/rbac/context.ts`
- Create: `lib/rbac/context.test.ts`

**Interfaces:**
- Consumes: `isPermission`, `Permission` (Task 3); `highestScope`, `RbacContext`, `Scope` (Task 2); `requireUser`, `getClientIdForUser` dari `@/lib/auth-guards`
- Produces:
  - `loadEffectivePermissions(userId: string): Promise<Map<Permission, Scope>>`
  - `getRbacContext(): Promise<RbacContext>`

- [ ] **Step 1: Tulis test yang gagal**

Create `lib/rbac/context.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { rolePermissions, roles, userRoles, users } from "@/lib/db/schema";
import { loadEffectivePermissions } from "@/lib/rbac/context";

/**
 * Menguji penggabungan izin dari banyak role. Fixture-nya memakai role dan
 * user ber-suffix acak, jadi file ini tidak menghapus tabel apa pun dan aman
 * berdampingan dengan data seed.
 */

const suffix = randomUUID().slice(0, 8);
const userId = `fixture-ctx-${suffix}`;
const lonerId = `fixture-loner-${suffix}`;
const roleAKey = `fixture-a-${suffix}`;
const roleBKey = `fixture-b-${suffix}`;

beforeAll(async () => {
  const [roleA] = await db
    .insert(roles)
    .values({ key: roleAKey, name: "Fixture A", area: "staff" })
    .returning();
  const [roleB] = await db
    .insert(roles)
    .values({ key: roleBKey, name: "Fixture B", area: "staff" })
    .returning();

  await db.insert(rolePermissions).values([
    { roleId: roleA.id, permission: "project.read", scope: "assigned" },
    { roleId: roleA.id, permission: "payment.read", scope: "own" },
    // Grant hantu: permission yang tidak ada di katalog kode.
    { roleId: roleA.id, permission: "fitur.dihapus", scope: "all" },
    { roleId: roleB.id, permission: "project.read", scope: "all" },
    { roleId: roleB.id, permission: "equipment.borrow", scope: "all" },
  ]);

  await db.insert(users).values([
    { id: userId, name: "Ctx User", email: `${userId}@fixture.test`, role: "surveyor" },
    { id: lonerId, name: "Loner", email: `${lonerId}@fixture.test`, role: "surveyor" },
  ]);

  await db.insert(userRoles).values([
    { userId, roleId: roleA.id },
    { userId, roleId: roleB.id },
  ]);
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(users).where(eq(users.id, lonerId));
  await db.delete(roles).where(eq(roles.key, roleAKey));
  await db.delete(roles).where(eq(roles.key, roleBKey));
});

describe("loadEffectivePermissions", () => {
  it("menggabungkan izin dari seluruh role", async () => {
    const permissions = await loadEffectivePermissions(userId);
    expect(permissions.get("payment.read")).toBe("own");
    expect(permissions.get("equipment.borrow")).toBe("all");
  });

  it("mengambil scope tertinggi saat dua role memberi izin yang sama", async () => {
    const permissions = await loadEffectivePermissions(userId);
    expect(permissions.get("project.read")).toBe("all");
  });

  it("mengabaikan grant yang tidak ada di katalog kode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const permissions = await loadEffectivePermissions(userId);
    expect(permissions.has("fitur.dihapus" as never)).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("user tanpa role sama sekali tidak punya izin apa pun", async () => {
    const permissions = await loadEffectivePermissions(lonerId);
    expect(permissions.size).toBe(0);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/context.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rbac/context'`

- [ ] **Step 3: Tulis `lib/rbac/context.ts`**

```ts
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getClientIdForUser, requireUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { rolePermissions, userRoles } from "@/lib/db/schema";
import { type Permission, isPermission } from "./resources";
import { type RbacContext, type Scope, highestScope } from "./types";

/**
 * Izin efektif seorang user = gabungan seluruh role-nya, mengambil scope
 * TERLUAS saat dua role memberi izin yang sama. Tidak ada aturan deny.
 */
export async function loadEffectivePermissions(userId: string): Promise<Map<Permission, Scope>> {
  const rows = await db
    .select({ permission: rolePermissions.permission, scope: rolePermissions.scope })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .where(eq(userRoles.userId, userId));

  const effective = new Map<Permission, Scope>();
  const unknown = new Set<string>();

  for (const row of rows) {
    // Fail-closed: grant yang tidak dikenal katalog diabaikan, bukan
    // diperlakukan sebagai izin. Menghapus fitur dari kode tidak boleh
    // meninggalkan grant hantu yang masih berlaku.
    if (!isPermission(row.permission)) {
      unknown.add(row.permission);
      continue;
    }
    const current = effective.get(row.permission);
    effective.set(row.permission, current ? highestScope(current, row.scope) : row.scope);
  }

  if (unknown.size > 0) {
    console.warn(`[rbac] grant diabaikan (tidak ada di katalog): ${[...unknown].join(", ")}`);
  }

  return effective;
}

/**
 * Konteks RBAC untuk request ini.
 *
 * Dibungkus React `cache()` sehingga hanya satu query walau dipanggil
 * puluhan kali dalam satu render. TIDAK di-cache lintas request dan tidak
 * dititipkan ke cookie sesi: perubahan role harus langsung berefek, sama
 * alasannya dengan `disableCookieCache: true` di `lib/auth-guards.ts`.
 */
export const getRbacContext = cache(async (): Promise<RbacContext> => {
  const user = await requireUser();
  const [permissions, clientId] = await Promise.all([
    loadEffectivePermissions(user.id),
    getClientIdForUser(user.id),
  ]);
  return { user, permissions, clientId };
});
```

- [ ] **Step 4: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/context.test.ts`
Expected: PASS (4 test)

- [ ] **Step 5: Commit**

```bash
git add lib/rbac/context.ts lib/rbac/context.test.ts
git commit -m "feat(rbac): getRbacContext + union izin multi-role"
```

---

### Task 6: `can.ts` + `filter.ts`

**Files:**
- Create: `lib/rbac/can.ts`
- Create: `lib/rbac/filter.ts`
- Create: `lib/rbac/test-fixtures.ts`
- Create: `lib/rbac/filter.test.ts`

**Interfaces:**
- Consumes: `RbacContext`, `Scope` (Task 2); `Permission`, `ScopedPermission`, `resourceOf` (Task 3)
- Produces:
  - `can(ctx, permission: Permission): boolean`
  - `scopeOf(ctx, permission: Permission): Scope | null`
  - `assertCan(ctx, permission: Permission): void`
  - `rbacFilter(ctx, permission: ScopedPermission): SQL`
  - `fakeContext(grants, overrides?): RbacContext` (fixture)

- [ ] **Step 1: Tulis fixture konteks**

Create `lib/rbac/test-fixtures.ts`:

```ts
import type { SessionUser } from "@/lib/auth-guards";
import type { RbacContext, Scope } from "./types";

const FIXTURE_USER: SessionUser = {
  id: "fixture-user",
  name: "Fixture User",
  email: "fixture@fixture.test",
  role: "surveyor",
};

/**
 * Konteks RBAC buatan untuk unit test — tidak menyentuh DB dan tidak
 * bergantung pada seed. Dipakai untuk menguji engine, bukan data.
 */
export function fakeContext(
  grants: Record<string, Scope>,
  overrides: Partial<RbacContext> = {},
): RbacContext {
  return {
    user: FIXTURE_USER,
    permissions: new Map(Object.entries(grants)),
    clientId: null,
    ...overrides,
  };
}
```

- [ ] **Step 2: Tulis test yang gagal**

Create `lib/rbac/filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { assertCan, can, scopeOf } from "@/lib/rbac/can";
import { rbacFilter } from "@/lib/rbac/filter";
import { fakeContext } from "@/lib/rbac/test-fixtures";

/** SQL yang dihasilkan filter, sebagai string — cukup untuk membedakan
 *  `true` / `false` / predikat sungguhan tanpa menyentuh DB. */
function sqlOf(query: { toSQL: () => { sql: string } }): string {
  return query.toSQL().sql;
}

function filterSql(ctx: Parameters<typeof rbacFilter>[0], permission: "project.read"): string {
  return sqlOf(db.select().from(projects).where(rbacFilter(ctx, permission)));
}

describe("can / scopeOf / assertCan", () => {
  it("true hanya kalau izinnya ada", () => {
    const ctx = fakeContext({ "project.read": "assigned" });
    expect(can(ctx, "project.read")).toBe(true);
    expect(can(ctx, "project.update")).toBe(false);
  });

  it("scopeOf mengembalikan null kalau tidak ada grant", () => {
    const ctx = fakeContext({ "project.read": "own" });
    expect(scopeOf(ctx, "project.read")).toBe("own");
    expect(scopeOf(ctx, "payment.void")).toBeNull();
  });

  it("assertCan melempar pesan berbahasa Indonesia", () => {
    const ctx = fakeContext({});
    expect(() => assertCan(ctx, "project.create")).toThrow(/tidak punya izin/i);
  });
});

describe("rbacFilter", () => {
  it("scope all menghasilkan predikat true", () => {
    const ctx = fakeContext({ "project.read": "all" });
    expect(filterSql(ctx, "project.read")).toMatch(/where true/i);
  });

  it("tanpa izin menghasilkan predikat false, bukan error", () => {
    const ctx = fakeContext({});
    expect(filterSql(ctx, "project.read")).toMatch(/where false/i);
  });

  it("scope yang tidak didefinisikan resource-nya juga false (fail-closed)", () => {
    // `client` hanya mendefinisikan scope `all`.
    const ctx = fakeContext({ "client.read": "own" });
    const sqlText = sqlOf(db.select().from(projects).where(rbacFilter(ctx, "client.read")));
    expect(sqlText).toMatch(/where false/i);
  });

  it("scope own tanpa clientId menghasilkan false, bukan query uuid ngawur", () => {
    const ctx = fakeContext({ "project.read": "own" }, { clientId: null });
    expect(filterSql(ctx, "project.read")).toMatch(/where false/i);
  });

  it("scope own dengan clientId menghasilkan perbandingan client_id", () => {
    const ctx = fakeContext({ "project.read": "own" }, { clientId: "11111111-1111-1111-1111-111111111111" });
    expect(filterSql(ctx, "project.read")).toMatch(/client_id/i);
  });

  it("scope assigned menghasilkan subquery fase", () => {
    const ctx = fakeContext({ "project.read": "assigned" });
    const sqlText = filterSql(ctx, "project.read");
    expect(sqlText).toMatch(/assigned_surveyor_id/i);
    expect(sqlText).toMatch(/exists/i);
  });
});
```

- [ ] **Step 3: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/filter.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rbac/can'`

- [ ] **Step 4: Tulis `lib/rbac/can.ts`**

```ts
import type { Permission } from "./resources";
import type { RbacContext, Scope } from "./types";

/** Boleh melakukan aksi ini sama sekali? Tidak melihat baris mana pun. */
export function can(ctx: RbacContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/** Jangkauan baris untuk izin ini, atau null kalau tidak punya izinnya. */
export function scopeOf(ctx: RbacContext, permission: Permission): Scope | null {
  return ctx.permissions.get(permission) ?? null;
}

/** Versi `can` yang melempar. Pesannya ditampilkan apa adanya ke user. */
export function assertCan(ctx: RbacContext, permission: Permission): void {
  if (!can(ctx, permission)) {
    throw new Error("Anda tidak punya izin untuk melakukan tindakan ini.");
  }
}
```

- [ ] **Step 5: Tulis `lib/rbac/filter.ts`**

```ts
import { type SQL, sql } from "drizzle-orm";
import { scopeOf } from "./can";
import { type ScopedPermission, resourceOf } from "./resources";
import type { RbacContext } from "./types";

/**
 * Predikat baris untuk sebuah izin. SELALU mengembalikan `SQL`, tidak pernah
 * `undefined`.
 *
 * Satu bentuk untuk semua kasus berarti ia langsung bisa masuk ke `and()`,
 * dan kasus "tidak punya izin" otomatis jadi `false` — himpunan kosong —
 * alih-alih bergantung pada pemanggil ingat menulis `if`. Lupa menanganinya
 * tetap aman.
 *
 *   db.select().from(projects)
 *     .where(and(rbacFilter(ctx, "project.read"), eq(projects.status, "aktif")))
 */
export function rbacFilter(ctx: RbacContext, permission: ScopedPermission): SQL {
  const scope = scopeOf(ctx, permission);
  if (!scope) return sql`false`;

  // Scope yang tidak didefinisikan resource-nya = tidak ada akses, BUKAN
  // akses penuh. Memberi grant `client.read:own` (yang tidak punya arti)
  // menghasilkan himpunan kosong, bukan seluruh tabel klien.
  const scopeFn = resourceOf(permission).scopes?.[scope];
  if (!scopeFn) return sql`false`;

  return scopeFn(ctx);
}
```

- [ ] **Step 6: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/filter.test.ts`
Expected: PASS (9 test)

- [ ] **Step 7: Commit**

```bash
git add lib/rbac/can.ts lib/rbac/filter.ts lib/rbac/test-fixtures.ts lib/rbac/filter.test.ts
git commit -m "feat(rbac): can() + rbacFilter() yang selalu mengembalikan SQL"
```

---

### Task 7: `requireScopedRow()` + guards

**Files:**
- Create: `lib/rbac/scoped-row.ts`
- Create: `lib/rbac/guards.test.ts`
- Modify: `lib/rbac/test-fixtures.ts`

**Interfaces:**
- Consumes: `rbacFilter` (Task 6), `resourceOf`, `ScopedPermission` (Task 3)
- Produces:
  - `requireScopedRow(ctx, permission: ScopedPermission, id: string): Promise<Record<string, unknown>>`
  - `checkGuard(resource: AnyResource, action, row): void` (diekspor untuk test)
  - `demoGuardResource` (fixture) — resource fixture ber-`guards` dan ber-`fields`

- [ ] **Step 1: Tambahkan resource fixture ke `lib/rbac/test-fixtures.ts`**

Tambahkan dua import ini ke blok import di ATAS file (import tidak boleh di
tengah modul):

```ts
import { projects } from "@/lib/db/schema";
import { defineResource } from "./define-resource";
```

Lalu sisipkan di akhir file:

```ts
/**
 * Resource fixture untuk menguji `guards` dan `fields`.
 *
 * Sengaja TIDAK didaftarkan ke registry: resource nyata belum boleh memakai
 * kedua fitur itu di sub-proyek 1 (mengisinya mengubah perilaku), tapi
 * engine-nya tetap harus terbukti bekerja.
 */
export const demoGuardResource = defineResource({
  name: "demo",
  actions: ["update", "readFinance"],
  table: { table: projects, id: projects.id },
  guards: {
    update: (row) =>
      row.status === "selesai" ? "Proyek yang sudah selesai tidak bisa diubah." : true,
  },
  fields: { contractValue: "demo.readFinance" },
});
```

- [ ] **Step 2: Tulis test yang gagal**

Create `lib/rbac/guards.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { checkGuard } from "@/lib/rbac/scoped-row";
import { demoGuardResource } from "@/lib/rbac/test-fixtures";

describe("checkGuard", () => {
  it("melewatkan baris yang lolos kondisi", () => {
    expect(() =>
      checkGuard(demoGuardResource, "update", { status: "berjalan" }),
    ).not.toThrow();
  });

  it("melempar pesan penolakan guard apa adanya", () => {
    expect(() => checkGuard(demoGuardResource, "update", { status: "selesai" })).toThrow(
      "Proyek yang sudah selesai tidak bisa diubah.",
    );
  });

  it("action tanpa guard selalu lolos", () => {
    expect(() =>
      checkGuard(demoGuardResource, "readFinance", { status: "selesai" }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/guards.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rbac/scoped-row'`

- [ ] **Step 4: Tulis `lib/rbac/scoped-row.ts`**

```ts
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { AnyResource } from "./define-resource";
import { rbacFilter } from "./filter";
import { type ScopedPermission, resourceOf } from "./resources";
import type { RbacContext } from "./types";

/** Menjalankan guard sebuah action terhadap baris yang sudah diambil. */
export function checkGuard(
  resource: AnyResource,
  action: string,
  row: Record<string, unknown>,
): void {
  const guard = resource.guards?.[action];
  if (!guard) return;
  const verdict = guard(row);
  if (verdict !== true) throw new Error(verdict);
}

/**
 * Satu baris, hanya kalau `ctx` boleh melihatnya.
 *
 * Query-nya memakai `rbacFilter` YANG SAMA dengan jalur daftar — bukan
 * predikat JS terpisah. Itulah yang membunuh permanen bug "guard dan daftar
 * beda aturan" yang diwanti-wanti komentar di `lib/auth-guards.ts`: aturan
 * scope hanya ditulis sekali, di `lib/rbac/resources/<x>.ts`.
 *
 * `notFound()` dipakai untuk baris yang tidak ada MAUPUN yang bukan miliknya
 * — respons tidak boleh membedakan keduanya.
 */
export async function requireScopedRow(
  ctx: RbacContext,
  permission: ScopedPermission,
  id: string,
): Promise<Record<string, unknown>> {
  const resource = resourceOf(permission);
  if (!resource.table) {
    throw new Error(`rbac: resource "${resource.name}" tidak punya tabel.`);
  }

  const [row] = await db
    .select()
    .from(resource.table.table)
    .where(and(eq(resource.table.id, id), rbacFilter(ctx, permission)))
    .limit(1);

  if (!row) notFound();

  const [, action] = permission.split(".");
  checkGuard(resource, action, row as Record<string, unknown>);
  return row as Record<string, unknown>;
}
```

- [ ] **Step 5: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/guards.test.ts`
Expected: PASS (3 test)

- [ ] **Step 6: Commit**

```bash
git add lib/rbac/scoped-row.ts lib/rbac/guards.test.ts lib/rbac/test-fixtures.ts
git commit -m "feat(rbac): requireScopedRow memakai filter yang sama dengan daftar"
```

---

### Task 8: `redact()` — field-level

**Files:**
- Create: `lib/rbac/fields.ts`
- Create: `lib/rbac/fields.test.ts`

**Interfaces:**
- Consumes: `can` (Task 6), `demoGuardResource` (Task 7)
- Produces: `redact<T>(ctx, resource: AnyResource, row: T): Partial<T>`

- [ ] **Step 1: Tulis test yang gagal**

Create `lib/rbac/fields.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redact } from "@/lib/rbac/fields";
import { demoGuardResource, fakeContext } from "@/lib/rbac/test-fixtures";

describe("redact", () => {
  const row = { id: "p1", title: "Proyek A", contractValue: 5_000_000 };

  it("membuang field yang tidak boleh dilihat", () => {
    const ctx = fakeContext({});
    const result = redact(ctx, demoGuardResource, row);
    expect(result).toEqual({ id: "p1", title: "Proyek A" });
    expect("contractValue" in result).toBe(false);
  });

  it("mempertahankan field kalau izinnya ada", () => {
    const ctx = fakeContext({ "demo.readFinance": "all" });
    expect(redact(ctx, demoGuardResource, row)).toEqual(row);
  });

  it("tidak mengubah baris aslinya", () => {
    const ctx = fakeContext({});
    redact(ctx, demoGuardResource, row);
    expect(row.contractValue).toBe(5_000_000);
  });
});
```

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/fields.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rbac/fields'`

- [ ] **Step 3: Tulis `lib/rbac/fields.ts`**

```ts
import { can } from "./can";
import type { AnyResource } from "./define-resource";
import type { Permission } from "./resources";
import type { RbacContext } from "./types";

/**
 * Membuang kolom sensitif yang tidak boleh dilihat `ctx`.
 *
 * Mengembalikan `Partial<T>`, bukan `T`: kolomnya benar-benar HILANG, bukan
 * di-null-kan, dan tipenya jujur soal itu — konsumen dipaksa menangani
 * ketidakhadirannya, yang memang inti dari field-level. Baris aslinya tidak
 * diubah.
 */
export function redact<T extends Record<string, unknown>>(
  ctx: RbacContext,
  resource: AnyResource,
  row: T,
): Partial<T> {
  if (!resource.fields) return row;

  const result: Partial<T> = { ...row };
  for (const [field, permission] of Object.entries(resource.fields)) {
    if (!can(ctx, permission as Permission)) {
      delete result[field as keyof T];
    }
  }
  return result;
}
```

- [ ] **Step 4: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/fields.test.ts`
Expected: PASS (3 test)

- [ ] **Step 5: Commit**

```bash
git add lib/rbac/fields.ts lib/rbac/fields.test.ts
git commit -m "feat(rbac): redact() untuk field-level"
```

---

### Task 9: Test parity — bukti nol perubahan perilaku

**Files:**
- Create: `lib/rbac/parity.test.ts`

**Interfaces:**
- Consumes: `rbacFilter`, `requireScopedRow`, `loadEffectivePermissions`, `seedSystemRoles`, `backfillUserRoles`; `assertProjectAccess`, `listProjectsForUser` dari `@/lib/auth-guards`
- Produces: tidak ada — ini test murni

- [ ] **Step 1: Tulis test parity**

Create `lib/rbac/parity.test.ts`:

```ts
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SessionUser, assertProjectAccess, listProjectsForUser } from "@/lib/auth-guards";
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
 * BUKTI PARITY — inti sub-proyek 1.
 *
 * Pada data yang sama, `rbacFilter` harus menghasilkan himpunan yang IDENTIK
 * dengan `listProjectsForUser` lama, dan `requireScopedRow` harus menolak di
 * kasus yang sama persis dengan `assertProjectAccess`. Kalau file ini gagal,
 * RBAC mengubah perilaku — dan sub-proyek 1 melarang itu.
 *
 * Mengikuti pola `lib/auth-guards.test.ts`: menghapus tabel app, memasang
 * fixture deterministik, lalu memulihkan seed dev kanonik di akhir.
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

describe("rbacFilter setara listProjectsForUser", () => {
  it("admin melihat himpunan yang sama", async () => {
    const lama = (await listProjectsForUser(admin)).map((p) => p.id).sort();
    expect(await scopedProjectIds(adminCtx)).toEqual(lama);
  });

  it("surveyor melihat himpunan yang sama, termasuk akses lewat fase", async () => {
    const lama = (await listProjectsForUser(surveyorA)).map((p) => p.id).sort();
    const baru = await scopedProjectIds(surveyorCtx);
    expect(baru).toEqual(lama);
    expect(baru).toContain(projA3);
    expect(baru).not.toContain(projA2);
  });

  it("client melihat himpunan yang sama", async () => {
    const lama = (await listProjectsForUser(clientUserA)).map((p) => p.id).sort();
    const baru = await scopedProjectIds(clientCtx);
    expect(baru).toEqual(lama);
    expect(baru).not.toContain(projB1);
  });

  it("user tanpa role sama sekali tidak melihat apa pun", async () => {
    const kosong: RbacContext = { user: surveyorA, permissions: new Map(), clientId: null };
    expect(await scopedProjectIds(kosong)).toEqual([]);
  });
});

describe("requireScopedRow setara assertProjectAccess", () => {
  it("admin bisa membuka proyek mana pun", async () => {
    await expect(assertProjectAccess(projB2, admin)).resolves.toBeTruthy();
    await expect(requireScopedRow(adminCtx, "project.read", projB2)).resolves.toBeTruthy();
  });

  it("surveyor ditolak pada proyek yang bukan miliknya — di kedua sistem", async () => {
    await expect(assertProjectAccess(projA2, surveyorA)).rejects.toThrow();
    await expect(requireScopedRow(surveyorCtx, "project.read", projA2)).rejects.toThrow();
  });

  it("surveyor diterima lewat penugasan fase — di kedua sistem", async () => {
    await expect(assertProjectAccess(projA3, surveyorA)).resolves.toBeTruthy();
    await expect(requireScopedRow(surveyorCtx, "project.read", projA3)).resolves.toBeTruthy();
  });

  it("client ditolak pada proyek klien lain — di kedua sistem", async () => {
    await expect(assertProjectAccess(projB1, clientUserA)).rejects.toThrow();
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
```

- [ ] **Step 2: Jalankan test**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/parity.test.ts`
Expected: PASS (16 test). Test ini menjalankan `pnpm db:seed:reset` di `afterAll`, jadi butuh beberapa detik ekstra.

Kalau ada assert yang gagal, **jangan longgarkan test-nya** — itu berarti matrix di `lib/rbac/system-roles.ts` atau fungsi scope di `lib/rbac/resources/` benar-benar berbeda dari perilaku lama. Perbaiki sumbernya.

- [ ] **Step 3: Commit**

```bash
git add lib/rbac/parity.test.ts
git commit -m "test(rbac): bukti parity rbacFilter vs listProjectsForUser"
```

---

### Task 10: Verifikasi menyeluruh

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: seluruh task sebelumnya
- Produces: tidak ada kode baru

- [ ] **Step 1: Jalankan seluruh test suite**

Run: `pnpm test`
Expected: seluruh file hijau — termasuk `lib/auth-guards.test.ts` dan `lib/auth-security.test.ts` yang **tidak boleh diubah sama sekali**.

Kalau ada test lama yang gagal, itu berarti sub-proyek 1 melanggar batasnya (mengubah perilaku). Perbaiki kode RBAC, bukan test lamanya.

- [ ] **Step 2: Verifikasi tidak ada call site lama yang tersentuh**

Run: `git diff --stat master -- app components proxy.ts lib/auth-guards.ts lib/actions/`
Expected: **kosong** kecuali tidak ada baris sama sekali. Satu-satunya file di luar `lib/rbac/` yang boleh berubah adalah `lib/db/schema.ts`, `lib/db/seed.ts`, `drizzle/`, dan `CLAUDE.md`.

- [ ] **Step 3: Lint + typecheck**

Run: `pnpm lint`
Expected: `Checked N files … No fixes applied.` tanpa error.

Run: `pnpm typecheck`
Expected: keluar tanpa output error.

- [ ] **Step 4: Dokumentasikan di `CLAUDE.md`**

Di bagian **Architecture**, sisipkan paragraf baru tepat setelah paragraf yang dimulai `**Server actions follow a strict 3-file split per domain**`:

```markdown
**RBAC lives in `lib/rbac/`, one file per resource.** A grant is a pair —
`(permission, scope)` — stored in `role_permission`; roles are DB rows
(`role`, `user_role`), and a user's effective permissions are the union of
their roles with the widest scope winning (`all > assigned > own`). The
permission catalog itself is code: each `lib/rbac/resources/<x>.ts` declares
`actions`, `scopes` (Drizzle SQL predicates), and optionally `guards` /
`fields`. **Adding a feature = adding one file there** — the `Permission`
union grows automatically, so typos fail at compile time.

Four functions are the whole public API: `can()` (action-level),
`rbacFilter()` (list — always returns `SQL`, `false` when unauthorized, so a
forgotten check yields an empty set rather than a leak), `requireScopedRow()`
(single row — re-queries with *the same* filter, which is what keeps the
list and the guard from ever drifting apart), and `redact()` (field-level).
`getRbacContext()` loads effective permissions once per request via React
`cache()` — never from the session cookie, for the same reason
`auth-guards.ts` sets `disableCookieCache`.

As of sub-project 1 the engine runs *alongside* the old `requireRole` /
`adminActionClient` checks and is not yet wired into any call site; the three
system roles are seeded to behave identically to the old hardcoded checks,
proven by `lib/rbac/parity.test.ts`.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(rbac): jelaskan engine RBAC di CLAUDE.md"
```

- [ ] **Step 6: Verifikasi akhir**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: ketiganya lolos.

---

## Kriteria Selesai

- [ ] Migrasi `role` / `role_permission` / `user_role` diterapkan ke dev DB
- [ ] Seed 3 system role + grant sesuai matrix, idempoten (Task 4)
- [ ] 11 resource terdaftar, hanya `actions` + `scopes` terisi (Task 3)
- [ ] Empat fungsi publik lengkap dengan test (Task 6–8)
- [ ] Test parity hijau (Task 9)
- [ ] Seluruh test lama hijau **tanpa diubah** (Task 10 Step 1)
- [ ] Tidak ada file di `app/`, `components/`, `lib/actions/`, `proxy.ts`, atau `lib/auth-guards.ts` yang berubah (Task 10 Step 2)
- [ ] `pnpm lint` dan `pnpm typecheck` bersih
