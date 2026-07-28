# Role Superuser + Admin UI Role Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `superuser` system role that can manage RBAC itself (roles, grants, role assignments) — something `admin` explicitly cannot do — plus a `Settings → Peran` UI to use it, and fix a pre-existing gap where `user_role_assignment` never stays in sync with `users.role` outside the initial seed.

**Architecture:** Everything builds on the existing RBAC engine (`lib/rbac/`) and its already-existing tables (`role`, `role_permission`, `user_role_assignment`) — no schema migration needed. A new table-less resource `role` adds five permissions (`role.read/create/update/delete/assign`). `system-roles.ts` grows a fourth system role (`superuser`) whose grants are the full catalog including `role.*`; `admin`'s grants become that same full catalog **minus** `role.*`. A new `lib/actions/roles-*` domain (3-file split, same pattern as every other domain) exposes CRUD for custom roles and assign/unassign of extra roles to users. A one-off script bootstraps the first superuser, since the UI that assigns roles itself requires `role.assign`.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres/Neon), Zod, next-safe-action, react-hook-form, Tailwind v4 + shadcn/ui, Vitest (against the real dev DB).

## Global Constraints

- **Never seed or test against prod** — all commands below use `.env.local` (dev branch). Do not run anything with `.env.prod`.
- Tests run with `fileParallelism: false` and hit a real Neon dev DB — no mocks.
- Every server action must declare `.metadata({ permission })` via `rbacActionClient` — no bare `createSafeActionClient()`.
- Business logic + role/scope rules live in `*-logic.ts`, unit-tested directly; `*.ts` action files stay thin wrappers.
- Follow the spec exactly: `docs/superpowers/specs/2026-07-24-role-superuser-design.md`.

---

## Task 1: Fix `user_role_assignment` sync (prerequisite bugfix)

**Files:**
- Modify: `lib/rbac/system-roles.ts` (add `roleIdForKey`)
- Modify: `lib/actions/users-logic.ts` (sync on create/setRole)
- Modify: `lib/actions/users.test.ts` (new coverage)

**Interfaces:**
- Produces: `roleIdForKey(key: SystemRoleKey): Promise<string>`, exported from `lib/rbac/system-roles.ts`. All later tasks that need a system role's DB id (bootstrap script, tests) use this instead of hand-rolling the same `select ... where roles.key = ...` query.

- [ ] **Step 1: Add `roleIdForKey` to `system-roles.ts`**

Add this function after `seedSystemRoles` (before `backfillUserRoles`) in `lib/rbac/system-roles.ts`:

```ts
/**
 * Cari id baris `role` sistem dari key-nya. Dipakai `users-logic.ts` untuk
 * menjaga `user_role_assignment` tetap sinkron dengan `users.role`, dan oleh
 * script bootstrap superuser.
 */
export async function roleIdForKey(key: SystemRoleKey): Promise<string> {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key));
  if (!role) throw new Error(`rbac: role sistem "${key}" belum di-seed.`);
  return role.id;
}
```

- [ ] **Step 2: Run typecheck to confirm it compiles**

Run: `pnpm typecheck`
Expected: no new errors.

- [ ] **Step 3: Wire the sync into `users-logic.ts`**

In `lib/actions/users-logic.ts`:

1. Add `userRoles` to the schema import (currently `import { accounts, clients, sessions, users } from "@/lib/db/schema";`):

```ts
import { accounts, clients, sessions, userRoles, users } from "@/lib/db/schema";
```

2. Add the import for `roleIdForKey` near the top (after the `RbacContext` import):

```ts
import { roleIdForKey } from "@/lib/rbac/system-roles";
```

3. In `createStaffUser`, right after the `await db.insert(users).values({...})` block and before the `accounts` insert, add:

```ts
  const roleId = await roleIdForKey(input.role);
  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
```

4. In `createClientUser`, right after `await db.update(clients).set({ userId }).where(eq(clients.id, clientId));` and before the `accounts` insert, add:

```ts
  const roleId = await roleIdForKey("client");
  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
```

5. In `setUserRole`, replace the final line (`await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));`) with:

```ts
  const oldRoleId = await roleIdForKey(target.role as StaffRole);
  await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, oldRoleId)));

  const newRoleId = await roleIdForKey(role);
  await db.insert(userRoles).values({ userId, roleId: newRoleId }).onConflictDoNothing();
```

(`and` is already imported in this file.)

- [ ] **Step 4: Write the failing tests first**

In `lib/actions/users.test.ts`, add `loadEffectivePermissions` to the imports:

```ts
import { loadEffectivePermissions } from "@/lib/rbac/context";
```

Then add a new `describe` block at the end of the file (after the last existing `describe`):

```ts
describe("sinkronisasi user_role_assignment", () => {
  it("createStaffUser memberi permission efektif sesuai role, bukan cuma users.role", async () => {
    const { id } = await createStaffUser(adminACtx, {
      name: "Staf Sinkron",
      email: "staf-sinkron@fixture.test",
      role: "surveyor",
      password: "rahasia-kuat-123",
    });

    const permissions = await loadEffectivePermissions(id);
    expect(permissions.get("equipment.read")).toBe("all");
    expect(permissions.has("user.create")).toBe(false);
  });

  it("createClientUser memberi permission client", async () => {
    const { id } = await createClientUser(adminACtx, {
      name: "Klien Sinkron",
      email: "klien-sinkron@fixture.test",
      password: "rahasia-kuat-123",
    });

    const permissions = await loadEffectivePermissions(id);
    expect(permissions.get("project.read")).toBe("own");
  });

  it("setUserRole memindahkan grant dari role lama ke role baru", async () => {
    await setUserRole(adminACtx, adminB.id, "surveyor");
    let permissions = await loadEffectivePermissions(adminB.id);
    expect(permissions.has("user.create")).toBe(false);
    expect(permissions.get("equipment.read")).toBe("all");

    await setUserRole(adminACtx, adminB.id, "admin");
    permissions = await loadEffectivePermissions(adminB.id);
    expect(permissions.get("user.create")).toBe("all");
  });
});
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/users.test.ts`
Expected: all tests in the file PASS (this file wipes/reseeds via `execSync("pnpm db:seed:reset")` in `afterAll`, so it's safe to run standalone).

- [ ] **Step 6: Run full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/rbac/system-roles.ts lib/actions/users-logic.ts lib/actions/users.test.ts
git commit -m "fix(rbac): sinkronkan user_role_assignment saat user dibuat/ganti role

Sebelumnya hanya seed awal (backfillUserRoles) yang mengisi
user_role_assignment — staf baru atau yang role-nya diganti lewat UI
berakhir tanpa permission RBAC apa pun. createStaffUser/createClientUser/
setUserRole sekarang menjaganya tetap sinkron."
```

---

## Task 2: RBAC resource `role` + grant restructuring

**Files:**
- Create: `lib/rbac/resources/role.ts`
- Modify: `lib/rbac/resources/index.ts`
- Modify: `lib/rbac/system-roles.ts`
- Modify: `lib/rbac/resources/index.test.ts`
- Modify: `lib/rbac/system-roles.test.ts`

**Interfaces:**
- Consumes: `defineResource` from `lib/rbac/define-resource.ts` (existing).
- Produces: permissions `role.read`, `role.create`, `role.update`, `role.delete`, `role.assign` added to the `Permission` union. `SystemRoleKey` becomes `"admin" | "surveyor" | "client" | "superuser"`. `SYSTEM_ROLE_GRANTS.superuser` is the full catalog; `SYSTEM_ROLE_GRANTS.admin` excludes `role.*`. Later tasks (`roles-logic.ts`, UI) use these permission strings as `.metadata({ permission })` values and `assertCan`/`can` checks.

- [ ] **Step 1: Write the failing tests first**

In `lib/rbac/resources/index.test.ts`, change:

```ts
  it("memuat 11 resource", () => {
    expect(Object.keys(RESOURCES)).toHaveLength(11);
  });
```

to:

```ts
  it("memuat 12 resource", () => {
    expect(Object.keys(RESOURCES)).toHaveLength(12);
  });
```

And add a fourth type-assertion line next to the existing two `@ts-expect-error` ones near the top of the file:

```ts
const _scopedOk: ScopedPermission[] = ["project.read", "payment.void", "document.share"];
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _profileNotScoped: ScopedPermission = "profile.updateOwn";
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _reportNotScoped: ScopedPermission = "report.export";
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _roleNotScoped: ScopedPermission = "role.read";
```

In `lib/rbac/system-roles.test.ts`, replace the existing seed-system-role tests with:

```ts
describe("seed system role", () => {
  it("membuat 4 role bawaan ber-flag isSystem", async () => {
    const rows = await db.select().from(roles).where(eq(roles.isSystem, true));
    expect(rows.map((r) => r.key).sort()).toEqual(["admin", "client", "superuser", "surveyor"]);
    expect(rows.find((r) => r.key === "client")?.area).toBe("client");
    expect(rows.find((r) => r.key === "superuser")?.area).toBe("staff");
  });

  it("superuser punya SETIAP permission di katalog, termasuk role.*", async () => {
    const grants = await grantsOf("superuser");
    expect(Object.keys(grants).sort()).toEqual([...PERMISSIONS].sort());
    expect(grants["role.assign"]).toBe("all");
  });

  it("superuser ber-scope all kecuali profile.updateOwn yang own", async () => {
    const grants = await grantsOf("superuser");
    expect(grants["profile.updateOwn"]).toBe("own");
    for (const [permission, scope] of Object.entries(grants)) {
      if (permission === "profile.updateOwn") continue;
      expect(scope, permission).toBe("all");
    }
  });

  it("admin punya SETIAP permission KECUALI role.*", async () => {
    const grants = await grantsOf("admin");
    const expected = PERMISSIONS.filter((p) => !p.startsWith("role."));
    expect(Object.keys(grants).sort()).toEqual([...expected].sort());
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/resources/index.test.ts lib/rbac/system-roles.test.ts`
Expected: FAIL — resource count is 11 not 12, `role.read` isn't a valid `Permission` (compile error), admin still has `role.*`-shaped nonexistent grants (n/a yet, but counts mismatch).

- [ ] **Step 3: Create the `role` resource**

Create `lib/rbac/resources/role.ts`:

```ts
import { defineResource } from "../define-resource";

/**
 * Tanpa tabel: role & permission bukan data per-baris-per-user, jadi tidak
 * ada yang perlu di-scope — hanya dipakai lewat `can()`. Dipisah dari `user`
 * supaya "siapa admin" dan "apa yang boleh dilakukan admin" tetap dua
 * permission independen — itulah yang membuat role `superuser` bermakna.
 */
export const roleResource = defineResource({
  name: "role",
  actions: ["read", "create", "update", "delete", "assign"],
});
```

- [ ] **Step 4: Register it in the resource registry**

In `lib/rbac/resources/index.ts`, add the import (alphabetically after `report`):

```ts
import { reportResource } from "./report";
import { roleResource } from "./role";
import { userResource } from "./user";
```

And add it to `RESOURCES` (after `report`):

```ts
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
  role: roleResource,
} as const;
```

- [ ] **Step 5: Restructure grants in `system-roles.ts`**

In `lib/rbac/system-roles.ts`, change the type and array:

```ts
export type SystemRoleKey = "admin" | "surveyor" | "client" | "superuser";
```

```ts
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
  {
    key: "superuser",
    name: "Superuser",
    description: "Akses admin penuh, ditambah kendali atas role & permission.",
    area: "staff",
  },
];
```

Replace the `adminGrants` block with:

```ts
/**
 * Superuser memegang SELURUH katalog dengan scope `all` — kecuali
 * `profile.updateOwn`, yang menurut namanya memang hanya menyasar dirinya
 * sendiri. Ditulis sebagai turunan katalog, bukan daftar manual, supaya
 * permission baru tidak pernah lupa diberikan.
 */
const superuserGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  PERMISSIONS.map((permission) => [permission, permission === "profile.updateOwn" ? "own" : "all"]),
);

/**
 * Admin = katalog penuh MINUS `role.*`. Mengelola role/permission sengaja
 * tidak otomatis mengalir ke admin — itulah satu-satunya alasan `superuser`
 * ada. Turunan dari `superuserGrants`, bukan daftar manual, untuk alasan yang
 * sama seperti di atas.
 */
const adminGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  Object.entries(superuserGrants).filter(([permission]) => !permission.startsWith("role.")),
);
```

And update `SYSTEM_ROLE_GRANTS` to add the `superuser` entry (keep `surveyor`/`client` bodies unchanged):

```ts
export const SYSTEM_ROLE_GRANTS: Record<SystemRoleKey, Partial<Record<Permission, Scope>>> = {
  admin: adminGrants,
  superuser: superuserGrants,

  surveyor: {
    // ...unchanged, keep exactly as-is
  },

  client: {
    // ...unchanged, keep exactly as-is
  },
};
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/resources/index.test.ts lib/rbac/system-roles.test.ts`
Expected: PASS.

- [ ] **Step 7: Run full typecheck + lint + full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: no errors. (Full suite matters here — `resourceOf`, `parity.test.ts`, and anywhere else `PERMISSIONS`/`RESOURCES` counts are assumed must still pass.)

- [ ] **Step 8: Commit**

```bash
git add lib/rbac/resources/role.ts lib/rbac/resources/index.ts lib/rbac/resources/index.test.ts lib/rbac/system-roles.ts lib/rbac/system-roles.test.ts
git commit -m "feat(rbac): tambah resource role + role superuser

Resource role (read/create/update/delete/assign) tanpa tabel. Superuser
memegang seluruh katalog termasuk role.*; admin = katalog penuh minus
role.* — mengelola role/permission sengaja tidak otomatis mengalir ke
admin biasa."
```

---

## Task 3: `roles-schemas.ts`

**Files:**
- Create: `lib/actions/roles-schemas.ts`

**Interfaces:**
- Consumes: `isPermission` from `@/lib/rbac/resources`, `SCOPES` from `@/lib/rbac/types`.
- Produces: `createRoleSchema`, `updateRoleSchema`, `deleteRoleSchema`, `assignRoleSchema`, `unassignRoleSchema` — all Zod schemas consumed by Task 4 (`roles-logic.ts` input types) and Task 5 (`roles.ts` `.inputSchema(...)`).

- [ ] **Step 1: Write the schemas**

Create `lib/actions/roles-schemas.ts`:

```ts
import { z } from "zod";
import { isPermission } from "@/lib/rbac/resources";
import { SCOPES } from "@/lib/rbac/types";

/**
 * `permission` divalidasi lewat `isPermission` (bukan `z.enum(PERMISSIONS)`)
 * karena `PERMISSIONS` adalah array runtime, bukan literal — `isPermission`
 * sudah jadi satu-satunya penjaga fail-closed untuk string permission di
 * seluruh engine (lihat `loadEffectivePermissions`), jadi dipakai ulang di
 * sini alih-alih menduplikasi daftarnya.
 */
const grantSchema = z.object({
  permission: z.string().refine(isPermission, "Permission tidak dikenal katalog."),
  scope: z.enum(SCOPES),
});

export const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(60),
  description: z.string().trim().max(300).optional(),
  area: z.enum(["staff", "client"]),
  grants: z.array(grantSchema).max(200),
});

export const updateRoleSchema = z.object({
  roleId: z.uuid(),
  name: z.string().trim().min(1, "Nama wajib diisi.").max(60),
  description: z.string().trim().max(300).optional(),
  grants: z.array(grantSchema).max(200),
});

export const deleteRoleSchema = z.object({
  roleId: z.uuid(),
});

export const assignRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});

export const unassignRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/roles-schemas.ts
git commit -m "feat(rbac): schema zod untuk domain roles"
```

---

## Task 4: `roles-logic.ts` + tests

**Files:**
- Create: `lib/actions/roles-logic.ts`
- Create: `lib/actions/roles.test.ts`

**Interfaces:**
- Consumes: `assertCan` (`@/lib/rbac/can`), `RbacContext` (`@/lib/rbac/types`), `roles`/`rolePermissions`/`userRoles`/`users` tables, `listUsers`/`ManagedUser` from `./users-logic`.
- Produces (consumed by Task 5's action wrappers and Task 8/9's UI):
  - `type RoleGrant = { permission: string; scope: Scope }`
  - `type RoleSummary = { id: string; key: string; name: string; description: string | null; area: "staff" | "client"; isSystem: boolean; grants: RoleGrant[] }`
  - `type RoleAssignment = { userId: string; userName: string; userEmail: string; roleId: string; roleName: string; roleKey: string }`
  - `type AssignableUser = { id: string; name: string; email: string }`
  - `listRoles(ctx): Promise<RoleSummary[]>`
  - `createRole(ctx, { name, description?, area, grants }): Promise<{ id: string }>`
  - `updateRole(ctx, { roleId, name, description?, grants }): Promise<void>`
  - `deleteRole(ctx, roleId): Promise<void>`
  - `listExtraRoleAssignments(ctx): Promise<RoleAssignment[]>`
  - `listAssignableUsers(ctx): Promise<AssignableUser[]>`
  - `assignRole(ctx, userId, roleId): Promise<void>`
  - `unassignRole(ctx, userId, roleId): Promise<void>`

- [ ] **Step 1: Write `roles-logic.ts`**

Create `lib/actions/roles-logic.ts`:

```ts
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { roles, rolePermissions, userRoles, users } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import { isPermission } from "@/lib/rbac/resources";
import type { RbacContext, Scope } from "@/lib/rbac/types";
import { listUsers } from "./users-logic";

/**
 * Business logic manajemen role, diuji langsung di `roles.test.ts`. Izin
 * ditegakkan lewat engine RBAC (`role.*` — hanya dipunyai `superuser` di
 * matrix, lihat `system-roles.ts`); admin biasa ditolak di sini juga, bukan
 * cuma di action wrapper.
 *
 * Role SISTEM (`isSystem = true`) sengaja tidak bisa diubah/dihapus dari
 * sini: grant-nya ditulis ulang seluruhnya oleh `seedSystemRoles()` tiap
 * deploy, jadi perubahan lewat UI akan hilang diam-diam kalau diizinkan.
 */

export type RoleGrant = { permission: string; scope: Scope };

export type RoleSummary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  area: "staff" | "client";
  isSystem: boolean;
  grants: RoleGrant[];
};

export type RoleAssignment = {
  userId: string;
  userName: string;
  userEmail: string;
  roleId: string;
  roleName: string;
  roleKey: string;
};

export type AssignableUser = { id: string; name: string; email: string };

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "role";
}

/** Key unik untuk role baru: slug nama, ditambah angka kalau bentrok. */
async function uniqueKeyFor(name: string): Promise<string> {
  const base = slugify(name);
  let key = base;
  let suffix = 1;
  for (;;) {
    const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, key));
    if (!existing) return key;
    suffix += 1;
    key = `${base}-${suffix}`;
  }
}

function assertKnownPermissions(grants: RoleGrant[]): void {
  for (const grant of grants) {
    if (!isPermission(grant.permission)) {
      throw new Error(`Permission "${grant.permission}" tidak dikenal katalog.`);
    }
  }
}

async function getRoleOrThrow(roleId: string) {
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId));
  if (!role) throw new Error("Role tidak ditemukan.");
  return role;
}

/** Semua role (sistem + kustom) beserta grant-nya. */
export async function listRoles(ctx: RbacContext): Promise<RoleSummary[]> {
  assertCan(ctx, "role.read");

  const [roleRows, grantRows] = await Promise.all([
    db.select().from(roles),
    db
      .select({
        roleId: rolePermissions.roleId,
        permission: rolePermissions.permission,
        scope: rolePermissions.scope,
      })
      .from(rolePermissions),
  ]);

  const grantsByRole = new Map<string, RoleGrant[]>();
  for (const row of grantRows) {
    const list = grantsByRole.get(row.roleId) ?? [];
    list.push({ permission: row.permission, scope: row.scope });
    grantsByRole.set(row.roleId, list);
  }

  return roleRows
    .map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      area: role.area,
      isSystem: role.isSystem,
      grants: grantsByRole.get(role.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Buat role kustom baru. Key-nya diturunkan otomatis dari nama. */
export async function createRole(
  ctx: RbacContext,
  input: { name: string; description?: string; area: "staff" | "client"; grants: RoleGrant[] },
): Promise<{ id: string }> {
  assertCan(ctx, "role.create");
  assertKnownPermissions(input.grants);

  const key = await uniqueKeyFor(input.name);
  const roleId = randomUUID();

  await db.insert(roles).values({
    id: roleId,
    key,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    area: input.area,
    isSystem: false,
  });

  if (input.grants.length > 0) {
    await db
      .insert(rolePermissions)
      .values(input.grants.map((grant) => ({ roleId, permission: grant.permission, scope: grant.scope })));
  }

  return { id: roleId };
}

/** Ubah nama/deskripsi/grant role kustom. Role sistem ditolak. */
export async function updateRole(
  ctx: RbacContext,
  input: { roleId: string; name: string; description?: string; grants: RoleGrant[] },
): Promise<void> {
  assertCan(ctx, "role.update");
  assertKnownPermissions(input.grants);

  const role = await getRoleOrThrow(input.roleId);
  if (role.isSystem) {
    throw new Error("Role sistem tidak bisa diubah dari sini — grant-nya ditentukan di kode.");
  }

  await db
    .update(roles)
    .set({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(roles.id, input.roleId));

  await db.delete(rolePermissions).where(eq(rolePermissions.roleId, input.roleId));
  if (input.grants.length > 0) {
    await db.insert(rolePermissions).values(
      input.grants.map((grant) => ({
        roleId: input.roleId,
        permission: grant.permission,
        scope: grant.scope,
      })),
    );
  }
}

/** Hapus role kustom. Role sistem ditolak. */
export async function deleteRole(ctx: RbacContext, roleId: string): Promise<void> {
  assertCan(ctx, "role.delete");
  const role = await getRoleOrThrow(roleId);
  if (role.isSystem) {
    throw new Error("Role sistem tidak bisa dihapus.");
  }
  await db.delete(roles).where(eq(roles.id, roleId));
}

/**
 * Assignment role TAMBAHAN saja — baris yang persis mencerminkan
 * `users.role` (mis. setiap admin otomatis punya assignment "admin")
 * disembunyikan, karena sudah terlihat di halaman User. Panel ini soal siapa
 * punya role EKSTRA di atas role dasarnya, misalnya `superuser`.
 */
export async function listExtraRoleAssignments(ctx: RbacContext): Promise<RoleAssignment[]> {
  assertCan(ctx, "role.read");

  const rows = await db
    .select({
      userId: userRoles.userId,
      userName: users.name,
      userEmail: users.email,
      userBaseRole: users.role,
      roleId: roles.id,
      roleName: roles.name,
      roleKey: roles.key,
    })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .innerJoin(roles, eq(roles.id, userRoles.roleId));

  return rows
    .filter((row) => row.roleKey !== row.userBaseRole)
    .map(({ userId, userName, userEmail, roleId, roleName, roleKey }) => ({
      userId,
      userName,
      userEmail,
      roleId,
      roleName,
      roleKey,
    }))
    .sort((a, b) => a.userName.localeCompare(b.userName));
}

/** User aktif yang bisa jadi target assignment role tambahan. */
export async function listAssignableUsers(ctx: RbacContext): Promise<AssignableUser[]> {
  assertCan(ctx, "role.read");
  const rows = await listUsers();
  return rows
    .filter((u) => !u.archivedAt)
    .map((u) => ({ id: u.id, name: u.name, email: u.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Beri role tambahan ke seorang user. Idempoten. */
export async function assignRole(ctx: RbacContext, userId: string, roleId: string): Promise<void> {
  assertCan(ctx, "role.assign");
  await getRoleOrThrow(roleId);

  const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!targetUser) throw new Error("User tidak ditemukan.");

  await db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
}

/**
 * Cabut role tambahan dari seorang user. Tidak boleh dipakai untuk mencabut
 * role dari diri sendiri — pola sama seperti "admin tidak bisa mengubah role
 * sendiri" di `users-logic.ts`: menghindari superuser mengunci dirinya
 * sendiri dari UI yang sedang ia buka.
 */
export async function unassignRole(ctx: RbacContext, userId: string, roleId: string): Promise<void> {
  assertCan(ctx, "role.assign");
  if (ctx.user.id === userId) {
    throw new Error("Anda tidak bisa mencabut role dari akun Anda sendiri — minta superuser lain melakukannya.");
  }
  await db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
}
```

- [ ] **Step 2: Write `roles.test.ts`**

Create `lib/actions/roles.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assignRole,
  createRole,
  deleteRole,
  listAssignableUsers,
  listExtraRoleAssignments,
  listRoles,
  unassignRole,
  updateRole,
} from "@/lib/actions/roles-logic";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";

let admin: SessionUser;
let superuser: SessionUser;
let adminCtx: RbacContext;
let superuserCtx: RbacContext;
const createdUserIds: string[] = [];

async function makeUser(role: "admin" | "surveyor"): Promise<SessionUser> {
  const id = `fixture-roles-${randomUUID().slice(0, 8)}`;
  const email = `${id}@fixture.test`;
  await db.insert(users).values({ id, name: id, email, role });
  createdUserIds.push(id);
  return { id, name: id, email, role };
}

beforeAll(async () => {
  await seedSystemRoles();
  admin = await makeUser("admin");
  superuser = await makeUser("admin");
  await backfillUserRoles();

  const [superuserRole] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "superuser"));
  await db.insert(userRoles).values({ userId: superuser.id, roleId: superuserRole.id });

  adminCtx = await makeTestContextForUser(admin);
  superuserCtx = await makeTestContextForUser(superuser);
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(users).where(eq(users.id, id));
  }
});

describe("listRoles", () => {
  it("admin ditolak — tidak punya role.read", async () => {
    await expect(listRoles(adminCtx)).rejects.toThrow(/tidak punya izin/i);
  });

  it("superuser melihat semua role sistem beserta grant-nya", async () => {
    const rows = await listRoles(superuserCtx);
    expect(rows.map((r) => r.key)).toEqual(
      expect.arrayContaining(["admin", "surveyor", "client", "superuser"]),
    );
    const superuserRow = rows.find((r) => r.key === "superuser");
    expect(superuserRow?.isSystem).toBe(true);
    expect(superuserRow?.grants.some((g) => g.permission === "role.assign")).toBe(true);
  });
});

describe("createRole / updateRole / deleteRole", () => {
  it("admin ditolak membuat role", async () => {
    await expect(createRole(adminCtx, { name: "Test", area: "staff", grants: [] })).rejects.toThrow(
      /tidak punya izin/i,
    );
  });

  it("superuser membuat role kustom dengan key ter-slug dari nama", async () => {
    const { id } = await createRole(superuserCtx, {
      name: "Editor Dokumen",
      area: "staff",
      grants: [{ permission: "document.read", scope: "all" }],
    });

    const [row] = await db.select().from(roles).where(eq(roles.id, id));
    expect(row.key).toBe("editor-dokumen");
    expect(row.isSystem).toBe(false);

    const rows = await listRoles(superuserCtx);
    const created = rows.find((r) => r.id === id);
    expect(created?.grants).toEqual([{ permission: "document.read", scope: "all" }]);

    await deleteRole(superuserCtx, id);
  });

  it("menolak grant untuk permission yang tidak dikenal katalog", async () => {
    await expect(
      createRole(superuserCtx, {
        name: "Role Salah",
        area: "staff",
        grants: [{ permission: "nonsense.read", scope: "all" }],
      }),
    ).rejects.toThrow(/tidak dikenal katalog/i);
  });

  it("role sistem tidak bisa diubah maupun dihapus", async () => {
    const [adminRole] = await db.select().from(roles).where(eq(roles.key, "admin"));
    await expect(
      updateRole(superuserCtx, { roleId: adminRole.id, name: "Admin", grants: [] }),
    ).rejects.toThrow(/role sistem tidak bisa diubah/i);
    await expect(deleteRole(superuserCtx, adminRole.id)).rejects.toThrow(/role sistem tidak bisa dihapus/i);
  });
});

describe("assignRole / unassignRole", () => {
  it("menambah lalu mencabut role tambahan", async () => {
    const { id: roleId } = await createRole(superuserCtx, { name: "Sementara", area: "staff", grants: [] });

    await assignRole(superuserCtx, admin.id, roleId);
    let extra = await listExtraRoleAssignments(superuserCtx);
    expect(extra.some((a) => a.userId === admin.id && a.roleId === roleId)).toBe(true);

    await unassignRole(superuserCtx, admin.id, roleId);
    extra = await listExtraRoleAssignments(superuserCtx);
    expect(extra.some((a) => a.userId === admin.id && a.roleId === roleId)).toBe(false);

    await deleteRole(superuserCtx, roleId);
  });

  it("assignment yang mencerminkan role dasar TIDAK muncul di listExtraRoleAssignments", async () => {
    const extra = await listExtraRoleAssignments(superuserCtx);
    // superuser sendiri punya assignment "admin" (role dasar) + "superuser" (ekstra).
    expect(extra.some((a) => a.userId === superuser.id && a.roleKey === "admin")).toBe(false);
    expect(extra.some((a) => a.userId === superuser.id && a.roleKey === "superuser")).toBe(true);
  });

  it("tidak bisa mencabut role dari diri sendiri", async () => {
    const [superuserRole] = await db.select().from(roles).where(eq(roles.key, "superuser"));
    await expect(unassignRole(superuserCtx, superuser.id, superuserRole.id)).rejects.toThrow(
      /tidak bisa mencabut role dari akun Anda sendiri/i,
    );
  });
});

describe("listAssignableUsers", () => {
  it("hanya user aktif, ditolak untuk admin biasa", async () => {
    await expect(listAssignableUsers(adminCtx)).rejects.toThrow(/tidak punya izin/i);
    const rows = await listAssignableUsers(superuserCtx);
    expect(rows.some((u) => u.id === admin.id)).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/actions/roles.test.ts`
Expected: PASS. (No global reset needed — every fixture user/role this file creates, it also deletes; `roles`/`user_role_assignment` rows cascade-delete via FK `onDelete: "cascade"` when the fixture users are deleted.)

- [ ] **Step 4: Run full typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/roles-logic.ts lib/actions/roles.test.ts
git commit -m "feat(rbac): business logic domain roles (CRUD role, assign/unassign)"
```

---

## Task 5: `roles.ts` server actions

**Files:**
- Create: `lib/actions/roles.ts`

**Interfaces:**
- Consumes: `rbacActionClient` (`@/lib/actions/safe-action`), everything from Task 3 (`roles-schemas.ts`) and Task 4 (`roles-logic.ts`).
- Produces: `createRoleAction`, `updateRoleAction`, `deleteRoleAction`, `assignRoleAction`, `unassignRoleAction` — consumed by Task 8/9 UI components via `useAction(...)`.

- [ ] **Step 1: Write `roles.ts`**

Create `lib/actions/roles.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { rbacActionClient } from "@/lib/actions/safe-action";
import {
  assignRole,
  createRole,
  deleteRole,
  unassignRole,
  updateRole,
} from "@/lib/actions/roles-logic";
import {
  assignRoleSchema,
  createRoleSchema,
  deleteRoleSchema,
  unassignRoleSchema,
  updateRoleSchema,
} from "@/lib/actions/roles-schemas";

/**
 * Server actions manajemen role. Semuanya lewat `rbacActionClient` dengan
 * permission `role.*` — hanya `superuser` yang punya di matrix, admin biasa
 * ditolak di sini sebelum satu baris logic pun berjalan.
 *
 * `listRoles`/`listExtraRoleAssignments`/`listAssignableUsers` TIDAK punya
 * wrapper action: keduanya dipanggil langsung dari Server Component
 * (`app/dashboard/settings/roles/page.tsx`), pola yang sama dengan
 * `listUsers` di `users/page.tsx`.
 */

const ROLES_PATH = "/dashboard/settings/roles";

export const createRoleAction = rbacActionClient
  .metadata({ permission: "role.create" })
  .inputSchema(createRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id } = await createRole(ctx.rbac, parsedInput);
    revalidatePath(ROLES_PATH);
    return { success: true as const, id };
  });

export const updateRoleAction = rbacActionClient
  .metadata({ permission: "role.update" })
  .inputSchema(updateRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await updateRole(ctx.rbac, parsedInput);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });

export const deleteRoleAction = rbacActionClient
  .metadata({ permission: "role.delete" })
  .inputSchema(deleteRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await deleteRole(ctx.rbac, parsedInput.roleId);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });

export const assignRoleAction = rbacActionClient
  .metadata({ permission: "role.assign" })
  .inputSchema(assignRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await assignRole(ctx.rbac, parsedInput.userId, parsedInput.roleId);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });

export const unassignRoleAction = rbacActionClient
  .metadata({ permission: "role.assign" })
  .inputSchema(unassignRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await unassignRole(ctx.rbac, parsedInput.userId, parsedInput.roleId);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });
```

- [ ] **Step 2: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/roles.ts
git commit -m "feat(rbac): server actions domain roles"
```

---

## Task 6: Bootstrap script `grant-superuser.ts`

**Files:**
- Create: `scripts/grant-superuser.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `db` (`../lib/db/index`), `roles`/`userRoles`/`users` (`../lib/db/schema`). No exports — this is a standalone CLI script.

- [ ] **Step 1: Write the script**

Create `scripts/grant-superuser.ts`:

```ts
import { eq } from "drizzle-orm";
import { db } from "../lib/db/index";
import { roles, userRoles, users } from "../lib/db/schema";

/**
 * Bootstrap superuser pertama. Chicken-and-egg: assign role lewat UI butuh
 * `role.assign`, yang cuma dipunyai superuser — jadi superuser pertama tidak
 * bisa dibuat lewat UI. Dijalankan manual sekali per environment.
 *
 * Usage: pnpm db:grant-superuser you@example.com
 */
async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: pnpm db:grant-superuser <email>");
    process.exit(1);
  }

  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, email));
  if (!user) {
    console.error(`Tidak ada user dengan email "${email}".`);
    process.exit(1);
  }

  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "superuser"));
  if (!role) {
    console.error('Role "superuser" belum ada di DB ini — jalankan `pnpm db:seed` dulu.');
    process.exit(1);
  }

  await db.insert(userRoles).values({ userId: user.id, roleId: role.id }).onConflictDoNothing();
  console.log(`✓ ${user.name} <${email}> sekarang superuser.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Register the pnpm script**

In `package.json`, add this line right after `"db:check-drift": "tsx --env-file=.env.local scripts/check-drift.ts",`:

```json
    "db:grant-superuser": "tsx --env-file=.env.local scripts/grant-superuser.ts",
```

- [ ] **Step 3: Run it manually against the dev DB to verify**

Run: `pnpm db:seed` (make sure the dev DB has the seed sentinel admin), then:

Run: `pnpm db:grant-superuser admin@pkp.test`
Expected: `✓ Admin <admin@pkp.test> sekarang superuser.`

Verify: `pnpm db:studio`, open `user_role_assignment`, confirm a row exists mapping the seed admin's id to the `superuser` role id. (Or query it: re-run `pnpm db:grant-superuser admin@pkp.test` again — expected output is the same success line, proving `onConflictDoNothing` makes it idempotent.)

- [ ] **Step 4: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/grant-superuser.ts package.json
git commit -m "feat(rbac): script bootstrap db:grant-superuser"
```

---

## Task 7: Settings tabs (User / Peran)

**Files:**
- Create: `components/settings/settings-tabs.tsx`
- Modify: `app/dashboard/settings/layout.tsx`

**Interfaces:**
- Consumes: `usePathname` (`next/navigation`), `cn` (`@/lib/utils`).
- Produces: `<SettingsTabs showRoles={boolean} />`, rendered by `app/dashboard/settings/layout.tsx` above `{children}`. Task 9 relies on the "Peran" tab existing to reach `/dashboard/settings/roles`.

- [ ] **Step 1: Create the tabs component**

Create `components/settings/settings-tabs.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/settings/users", label: "User" },
  { href: "/dashboard/settings/roles", label: "Peran" },
] as const;

/**
 * Tab internal di dalam area Pengaturan. Sengaja terpisah dari sidebar
 * (`nav-config.ts`), yang cuma punya satu entri "Pengaturan" — tab "Peran"
 * hanya untuk yang punya `role.read` (praktis: superuser), jadi disembunyikan
 * lewat prop `showRoles`, bukan lewat gating nav-config yang sekarang cuma
 * mengenal satu permission per entri.
 */
export function SettingsTabs({ showRoles }: { showRoles: boolean }) {
  const pathname = usePathname();
  const tabs = showRoles ? TABS : TABS.filter((tab) => tab.label !== "Peran");
  if (tabs.length < 2) return null;

  return (
    <nav className="flex gap-1 border-b border-foreground/10">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Wire it into the settings layout**

Replace the full contents of `app/dashboard/settings/layout.tsx` with:

```tsx
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

/**
 * Gerbang sesungguhnya untuk seluruh area Pengaturan: `user.read`
 * (admin/superuser di matrix).
 *
 * Menyembunyikan tautan "Pengaturan" dari sidebar surveyor BUKAN pengamanan —
 * surveyor tetap bisa mengetik URL-nya. Inilah yang menolaknya, dan ia menolak
 * setiap route di bawah /dashboard/settings sekaligus, jadi halaman baru yang
 * ditambahkan nanti terlindungi sejak lahir tanpa perlu ingat memasang guard.
 *
 * Tab "Peran" digerbangi TERPISAH di sini (`role.read`) karena admin punya
 * `user.read` tapi bukan `role.*` — kalau tidak, admin biasa akan melihat tab
 * yang menuju halaman yang toh akan menolaknya.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const ctx = await getRbacContext();
  if (!can(ctx, "user.read")) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="px-6 pt-6 sm:px-8">
        <SettingsTabs showRoles={can(ctx, "role.read")} />
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Manual check in the browser**

Run: `pnpm dev`, log in as the seed admin (`admin@pkp.test` / `password123`), visit `/dashboard/settings/users`.
Expected: a "User" tab (active) is visible; no "Peran" tab (admin doesn't have `role.read` yet — Task 6's grant only applies to whichever user you ran the script against; if that was this same admin, restart the dev server session / re-login so the DB session cache reflects it, then the "Peran" tab should appear and clicking it should reach `/dashboard/settings/roles` — which 404s until Task 8, that's expected for now).

- [ ] **Step 5: Commit**

```bash
git add components/settings/settings-tabs.tsx app/dashboard/settings/layout.tsx
git commit -m "feat(rbac): tab User/Peran di area Pengaturan"
```

---

## Task 8: Roles page + role CRUD UI

**Files:**
- Create: `components/roles/role-permission-editor.tsx`
- Create: `components/roles/role-form-dialog.tsx`
- Create: `components/roles/roles-table.tsx`
- Create: `app/dashboard/settings/roles/page.tsx`

**Interfaces:**
- Consumes: `RoleSummary`, `createRoleAction`/`updateRoleAction`/`deleteRoleAction` (Task 5), `createRoleSchema` (Task 3), `listRoles` (Task 4), `PERMISSIONS` (`@/lib/rbac/resources`), shadcn primitives (`Dialog`, `Button`, `Input`, `Label`, `SelectField`, `Table`, `Badge`, `ConfirmDialog`).
- Produces: `<RolesTable roles={RoleSummary[]} />`, rendered by `app/dashboard/settings/roles/page.tsx`. Task 9 adds a second section to the same page.

- [ ] **Step 1: Create the permission grant editor**

Create `components/roles/role-permission-editor.tsx`:

```tsx
"use client";

import { SelectField } from "@/components/ui/select-field";
import { PERMISSIONS } from "@/lib/rbac/resources";

export type ScopeChoice = "" | "all" | "assigned" | "own";

const SCOPE_OPTIONS = [
  { value: "", label: "Tidak diberikan" },
  { value: "all", label: "Semua (all)" },
  { value: "assigned", label: "Ditugaskan (assigned)" },
  { value: "own", label: "Milik sendiri (own)" },
];

function groupByResource(permissions: readonly string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const permission of permissions) {
    const [resource] = permission.split(".");
    (groups[resource] ??= []).push(permission);
  }
  return groups;
}

/**
 * Editor grant per permission, dikelompokkan per resource. Scope yang tidak
 * didukung sebuah resource (mis. resource tanpa tabel hanya punya makna
 * "diberikan atau tidak") tetap fail-closed di engine — salah pilih di sini
 * paling buruk berarti izin itu tidak berlaku, bukan lubang keamanan.
 */
export function RolePermissionEditor({
  value,
  onChange,
}: {
  value: Record<string, ScopeChoice>;
  onChange: (permission: string, scope: ScopeChoice) => void;
}) {
  const groups = groupByResource(PERMISSIONS);

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(groups).map(([resource, permissions]) => (
        <div key={resource} className="flex flex-col gap-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{resource}</p>
          {permissions.map((permission) => (
            <div key={permission} className="grid grid-cols-2 items-center gap-2">
              <span className="truncate text-sm">{permission}</span>
              <SelectField
                aria-label={permission}
                className="w-full"
                options={SCOPE_OPTIONS}
                value={value[permission] ?? ""}
                onValueChange={(v) => onChange(permission, v as ScopeChoice)}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the role create/edit dialog**

Create `components/roles/role-form-dialog.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { type ScopeChoice, RolePermissionEditor } from "@/components/roles/role-permission-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { createRoleAction, updateRoleAction } from "@/lib/actions/roles";
import type { RoleSummary } from "@/lib/actions/roles-logic";
import { createRoleSchema } from "@/lib/actions/roles-schemas";

type FormValues = z.infer<typeof createRoleSchema>;

function grantsToRecord(grants: { permission: string; scope: string }[]): Record<string, ScopeChoice> {
  const record: Record<string, ScopeChoice> = {};
  for (const grant of grants) record[grant.permission] = grant.scope as ScopeChoice;
  return record;
}

/** Dialog buat role baru (tanpa prop `role`) atau ubah role kustom (dengan `role`). */
export function RoleFormDialog({ role }: { role?: RoleSummary }) {
  const isEdit = Boolean(role);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [grants, setGrants] = useState<Record<string, ScopeChoice>>(
    role ? grantsToRecord(role.grants) : {},
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createRoleSchema),
    defaultValues: {
      name: role?.name ?? "",
      description: role?.description ?? "",
      area: role?.area ?? "staff",
      grants: [],
    },
  });

  function closeAndReset() {
    reset();
    setFormError(null);
    setOpen(false);
    router.refresh();
  }

  const createAction = useAction(createRoleAction, {
    onSuccess: closeAndReset,
    onError: ({ error }) => setFormError(error.serverError ?? "Gagal membuat role."),
  });
  const updateAction = useAction(updateRoleAction, {
    onSuccess: closeAndReset,
    onError: ({ error }) => setFormError(error.serverError ?? "Gagal mengubah role."),
  });

  function onSubmit(values: FormValues) {
    const grantList = Object.entries(grants)
      .filter((entry): entry is [string, "all" | "assigned" | "own"] => entry[1] !== "")
      .map(([permission, scope]) => ({ permission, scope }));

    if (isEdit && role) {
      updateAction.execute({
        roleId: role.id,
        name: values.name,
        description: values.description,
        grants: grantList,
      });
      return;
    }
    createAction.execute({ ...values, grants: grantList });
  }

  const isPending = createAction.isPending || updateAction.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          isEdit ? (
            <Button variant="outline" size="sm">
              Ubah
            </Button>
          ) : (
            <Button>
              <PlusIcon />
              Buat role
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isEdit ? `Ubah role "${role?.name}"` : "Buat role baru"}</DialogTitle>
            <DialogDescription>
              Pilih scope tiap izin. Scope yang tidak didukung sebuah resource otomatis tidak
              memberi akses (fail-closed) — salah pilih tidak berbahaya.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            {formError ? (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nama</Label>
              <Input id="name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Deskripsi</Label>
              <Input id="description" {...register("description")} />
            </div>

            {isEdit ? null : (
              <div className="flex flex-col gap-2">
                <Label htmlFor="area">Area</Label>
                <Controller
                  control={control}
                  name="area"
                  render={({ field }) => (
                    <SelectField
                      id="area"
                      className="w-full"
                      options={[
                        { value: "staff", label: "Staf (/dashboard)" },
                        { value: "client", label: "Klien (/portal)" },
                      ]}
                      value={field.value ?? "staff"}
                      onValueChange={field.onChange}
                    />
                  )}
                />
              </div>
            )}

            <RolePermissionEditor value={grants} onChange={(p, s) => setGrants((g) => ({ ...g, [p]: s }))} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Menyimpan…" : isEdit ? "Simpan" : "Buat role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create the roles table**

Create `components/roles/roles-table.tsx`:

```tsx
"use client";

import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RoleFormDialog } from "@/components/roles/role-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteRoleAction } from "@/lib/actions/roles";
import type { RoleSummary } from "@/lib/actions/roles-logic";

export function RolesTable({ roles }: { roles: RoleSummary[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const router = useRouter();
  const { executeAsync } = useAction(deleteRoleAction);

  async function handleDelete(roleId: string): Promise<{ error?: string } | undefined> {
    const result = await executeAsync({ roleId });
    if (result?.serverError) return { error: result.serverError };
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <RoleFormDialog />
      </div>
      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Izin</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <>
                  <TableRow key={role.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {role.name}
                        {role.isSystem ? <Badge variant="outline">Sistem</Badge> : null}
                      </div>
                      {role.description ? (
                        <p className="text-xs text-muted-foreground">{role.description}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{role.area}</TableCell>
                    <TableCell>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => setExpandedId(expandedId === role.id ? null : role.id)}
                      >
                        {role.grants.length} izin
                      </Button>
                    </TableCell>
                    <TableCell>
                      {role.isSystem ? null : (
                        <div className="flex justify-end gap-2">
                          <RoleFormDialog role={role} />
                          <ConfirmDialog
                            trigger={
                              <Button variant="outline" size="sm">
                                Hapus
                              </Button>
                            }
                            title={`Hapus role "${role.name}"?`}
                            description="User yang punya role ini kehilangan izin yang berasal darinya. Tindakan ini tidak bisa dibatalkan."
                            confirmLabel="Hapus"
                            confirmVariant="destructive"
                            onConfirm={() => handleDelete(role.id)}
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  {expandedId === role.id ? (
                    <TableRow key={`${role.id}-detail`}>
                      <TableCell colSpan={4} className="bg-muted/30">
                        {role.grants.length === 0 ? (
                          <p className="py-2 text-sm text-muted-foreground">Belum ada izin.</p>
                        ) : (
                          <ul className="flex flex-wrap gap-2 py-2">
                            {role.grants.map((grant) => (
                              <li key={grant.permission}>
                                <Badge variant="secondary">
                                  {grant.permission} ({grant.scope})
                                </Badge>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the page**

Create `app/dashboard/settings/roles/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { RolesTable } from "@/components/roles/roles-table";
import { listRoles } from "@/lib/actions/roles-logic";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

export const metadata = { title: "Manajemen Role" };

/**
 * Manajemen role (superuser-only; `settings/layout.tsx` hanya menggerbangi
 * `user.read`, jadi permission `role.read` yang lebih sempit dicek eksplisit
 * di sini — pola yang sama dengan halaman lain di bawah /settings yang
 * butuh permission berbeda dari gerbang layout-nya).
 */
export default async function RolesPage() {
  const ctx = await getRbacContext();
  if (!can(ctx, "role.read")) redirect("/dashboard/settings/users");

  const roleRows = await listRoles(ctx);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Manajemen Role"
        description="Role sistem ditentukan di kode dan tidak bisa diubah dari sini. Buat role kustom untuk kebutuhan lain."
      />
      <RolesTable roles={roleRows} />
    </main>
  );
}
```

- [ ] **Step 5: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Manual check in the browser**

Run: `pnpm dev`. Log in as the user you ran `pnpm db:grant-superuser` against in Task 6 (re-login so the session cookie reflects the new permission). Visit `/dashboard/settings/roles`.
Expected: table lists 4 system roles (Admin, Surveyor, Klien, Superuser) each badged "Sistem" with no Ubah/Hapus buttons; clicking "N izin" expands a badge list of grants. Click "Buat role", fill a name (e.g. "Tes"), pick a couple of permissions with scope "all", submit — new row appears, editable/deletable. Edit it, change a grant, save — grants update. Delete it — row disappears. Log in as a plain admin (not superuser) and confirm `/dashboard/settings/roles` redirects to `/dashboard/settings/users`.

- [ ] **Step 7: Commit**

```bash
git add components/roles/role-permission-editor.tsx components/roles/role-form-dialog.tsx components/roles/roles-table.tsx app/dashboard/settings/roles/page.tsx
git commit -m "feat(rbac): halaman Settings > Peran — CRUD role kustom"
```

---

## Task 9: Role assignment UI

**Files:**
- Create: `components/roles/role-assignments-panel.tsx`
- Modify: `app/dashboard/settings/roles/page.tsx`

**Interfaces:**
- Consumes: `assignRoleAction`/`unassignRoleAction` (Task 5), `assignRoleSchema` (Task 3), `RoleAssignment`/`AssignableUser`/`listExtraRoleAssignments`/`listAssignableUsers` (Task 4).
- Produces: `<RoleAssignmentsPanel assignments={...} assignableRoles={...} assignableUsers={...} />`, added to the roles page below `<RolesTable>`.

- [ ] **Step 1: Create the assignment panel**

Create `components/roles/role-assignments-panel.tsx`:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { assignRoleAction, unassignRoleAction } from "@/lib/actions/roles";
import type { AssignableUser, RoleAssignment } from "@/lib/actions/roles-logic";
import { assignRoleSchema } from "@/lib/actions/roles-schemas";

type FormValues = z.infer<typeof assignRoleSchema>;

/**
 * Role EKSTRA saja — role dasar (Admin/Surveyor/Klien) diatur di halaman
 * User lewat "Ganti role". Panel ini untuk hal seperti menjadikan seorang
 * admin juga Superuser, atau memberi role kustom ke user tertentu.
 */
export function RoleAssignmentsPanel({
  assignments,
  assignableRoles,
  assignableUsers,
}: {
  assignments: RoleAssignment[];
  assignableRoles: { id: string; name: string }[];
  assignableUsers: AssignableUser[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(assignRoleSchema),
    defaultValues: { userId: "", roleId: "" },
  });

  const assign = useAction(assignRoleAction, {
    onSuccess: () => {
      reset({ userId: "", roleId: "" });
      setFormError(null);
      router.refresh();
    },
    onError: ({ error }) => setFormError(error.serverError ?? "Gagal menambah role."),
  });

  const { executeAsync: unassign } = useAction(unassignRoleAction);

  async function handleUnassign(userId: string, roleId: string) {
    const result = await unassign({ userId, roleId });
    if (!result?.serverError) router.refresh();
  }

  if (assignableRoles.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-heading text-lg font-semibold">Role tambahan</h2>
      <p className="text-sm text-muted-foreground">
        Role dasar (Admin/Surveyor/Klien) diatur di halaman User. Di sini hanya untuk role EKSTRA di
        atasnya, misalnya menjadikan seorang admin juga Superuser.
      </p>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={handleSubmit((values) => assign.execute(values))}
      >
        {formError ? (
          <p role="alert" className="w-full text-sm text-destructive">
            {formError}
          </p>
        ) : null}

        <Controller
          control={control}
          name="userId"
          render={({ field }) => (
            <SelectField
              aria-label="User"
              className="w-64"
              options={assignableUsers.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
              value={field.value ?? ""}
              onValueChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="roleId"
          render={({ field }) => (
            <SelectField
              aria-label="Role"
              className="w-48"
              options={assignableRoles.map((r) => ({ value: r.id, label: r.name }))}
              value={field.value ?? ""}
              onValueChange={field.onChange}
            />
          )}
        />
        <Button type="submit" disabled={assign.isPending}>
          {assign.isPending ? "Menyimpan…" : "Tambah"}
        </Button>
        {errors.userId || errors.roleId ? (
          <p className="w-full text-xs text-destructive">Pilih user dan role.</p>
        ) : null}
      </form>

      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Belum ada role tambahan yang diberikan.
                </TableCell>
              </TableRow>
            ) : (
              assignments.map((a) => (
                <TableRow key={`${a.userId}-${a.roleId}`}>
                  <TableCell>
                    {a.userName} <span className="text-muted-foreground">({a.userEmail})</span>
                  </TableCell>
                  <TableCell>
                    <Badge>{a.roleName}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => handleUnassign(a.userId, a.roleId)}>
                      Cabut
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the roles page**

In `app/dashboard/settings/roles/page.tsx`, update the imports and body:

```tsx
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/dashboard/page-header";
import { RoleAssignmentsPanel } from "@/components/roles/role-assignments-panel";
import { RolesTable } from "@/components/roles/roles-table";
import { listAssignableUsers, listExtraRoleAssignments, listRoles } from "@/lib/actions/roles-logic";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

export const metadata = { title: "Manajemen Role" };

export default async function RolesPage() {
  const ctx = await getRbacContext();
  if (!can(ctx, "role.read")) redirect("/dashboard/settings/users");

  const [roleRows, assignments, assignableUsers] = await Promise.all([
    listRoles(ctx),
    listExtraRoleAssignments(ctx),
    listAssignableUsers(ctx),
  ]);

  // Role dasar (admin/surveyor/client) diatur lewat "Ganti role" di halaman
  // User — panel di sini hanya menawarkan role EKSTRA (superuser + kustom).
  const assignableRoles = roleRows.filter(
    (role) => role.key !== "admin" && role.key !== "surveyor" && role.key !== "client",
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Manajemen Role"
        description="Role sistem ditentukan di kode dan tidak bisa diubah dari sini. Buat role kustom untuk kebutuhan lain, atau berikan role tambahan ke seorang user."
      />
      <RolesTable roles={roleRows} />
      <RoleAssignmentsPanel
        assignments={assignments}
        assignableRoles={assignableRoles.map((r) => ({ id: r.id, name: r.name }))}
        assignableUsers={assignableUsers}
      />
    </main>
  );
}
```

- [ ] **Step 3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Manual check in the browser**

With `pnpm dev` running and logged in as superuser, visit `/dashboard/settings/roles`. In "Role tambahan", pick a different staff user + the "Superuser" role, submit — a new row appears in the assignment table. Click "Cabut" — it disappears. Attempt to select yourself as the target user and submit — expect a server error message ("Anda tidak bisa mencabut role dari akun Anda sendiri...") if you try to unassign your own row (assigning to yourself first, then trying to remove it via "Cabut").

- [ ] **Step 5: Run the full test suite one more time**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: everything passes — this is the final state of the sub-project.

- [ ] **Step 6: Commit**

```bash
git add components/roles/role-assignments-panel.tsx app/dashboard/settings/roles/page.tsx
git commit -m "feat(rbac): panel assign/unassign role tambahan ke user"
```
