# Ekspansi Superuser — 6 Resource Baru (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah 6 resource baru (`audit`, `session`, `settings`, `storage`, `notification`, `backup`) — total 11 permission — ke katalog RBAC, dengan beberapa di antaranya **superuser-only** (tidak mengalir ke admin), mempertegas alasan keberadaan role superuser.

**Architecture:** Murni penambahan di lapisan RBAC. 6 file resource baru di `lib/rbac/resources/`, registrasi di `index.ts`, dan blocklist `SUPERUSER_ONLY_PREFIXES` di `system-roles.ts` untuk mencegah admin mendapat permission sistem. Tidak ada migrasi DB, tidak ada UI baru — resource table-less kecuali `audit` yang menempel ke `audit_log` yang sudah ada. UI untuk masing-masing resource adalah sub-proyek terpisah.

**Tech Stack:** Next.js App Router, Drizzle ORM (Postgres/Neon), Vitest (against real dev DB).

## Global Constraints

- **Never seed or test against prod** — all commands below use `.env.local` (dev branch).
- Tests run with `fileParallelism: false` and hit a real Neon dev DB — no mocks.
- Ikuti persis spec: `docs/superpowers/specs/2026-07-30-superuser-expansion-design.md`.
- Resource baru mengikuti pola yang sudah ada: `defineResource({ name, actions, table?, scopes? })`.
- Permission otomatis bertambah di `Permission` union; `superuserGrants` otomatis ikut karena turunan `PERMISSIONS.map`.

---

## Task 1: Buat 6 file resource + daftarkan di registry

**Files:**
- Create: `lib/rbac/resources/audit.ts`
- Create: `lib/rbac/resources/session.ts`
- Create: `lib/rbac/resources/settings.ts`
- Create: `lib/rbac/resources/storage.ts`
- Create: `lib/rbac/resources/notification.ts`
- Create: `lib/rbac/resources/backup.ts`
- Modify: `lib/rbac/resources/index.ts`
- Modify: `lib/rbac/resources/index.test.ts`

**Interfaces:**
- Consumes: `defineResource` dari `lib/rbac/define-resource.ts`, `auditLog`/`sessions` dari `lib/db/schema` (hanya `audit`).
- Produces: 11 permission baru masuk ke `Permission` union, katalog bertambah 6 resource.

- [ ] **Step 1: Tulis 6 resource file**

**`lib/rbac/resources/audit.ts`** — satu-satunya yang punya tabel:

```ts
import { sql } from "drizzle-orm";
import { auditLog } from "@/lib/db/schema";
import { defineResource } from "../define-resource";

/**
 * Log audit — superuser-only. Tabel `audit_log` sudah ada sejak Phase 1;
 * resource ini hanya membungkusnya dengan permission `audit.read`.
 * Scope `all`: superuser melihat seluruh log tanpa batasan.
 */
export const auditResource = defineResource({
  name: "audit",
  actions: ["read"],
  table: { table: auditLog, id: auditLog.id },
  scopes: { all: () => sql`true` },
});
```

**`lib/rbac/resources/session.ts`:**

```ts
import { defineResource } from "../define-resource";

/**
 * Manajemen sesi user — superuser-only. Table-less: action-nya query
 * tabel `session` Better Auth langsung dari logic layer.
 * `session.revoke` = cabut sesi user lain (hapus baris `session`).
 */
export const sessionResource = defineResource({
  name: "session",
  actions: ["read", "revoke"],
});
```

**`lib/rbac/resources/settings.ts`:**

```ts
import { defineResource } from "../define-resource";

/**
 * Konfigurasi sistem (nama studio, logo, dsb.) — admin + superuser.
 * Table-less untuk sekarang; nanti bisa ditambah tabel `settings` kalau
 * perlu menyimpan konfigurasi di DB.
 */
export const settingsResource = defineResource({
  name: "settings",
  actions: ["read", "update"],
});
```

**`lib/rbac/resources/storage.ts`:**

```ts
import { defineResource } from "../define-resource";

/**
 * Penggunaan storage (R2) — superuser-only. Table-less: action-nya
 * query R2 API, bukan DB. `storage.cleanup` = hapus file yatim yang
 * tidak lagi direferensi dari kolom `file_url` / `receipt_file_url`.
 */
export const storageResource = defineResource({
  name: "storage",
  actions: ["read", "cleanup"],
});
```

**`lib/rbac/resources/notification.ts`:**

```ts
import { defineResource } from "../define-resource";

/**
 * Kelola template & kirim notifikasi — admin + superuser.
 * Table-less; action-nya query `lib/notifications/` yang sudah ada.
 */
export const notificationResource = defineResource({
  name: "notification",
  actions: ["manage"],
});
```

**`lib/rbac/resources/backup.ts`:**

```ts
import { defineResource } from "../define-resource";

/**
 * Ekspor/impor data penuh — superuser-only. Table-less: action-nya
 * dump seluruh tabel ke JSON (ekspor) atau restore dari JSON (impor).
 * Tindakan destruktif + privasi — tidak diberikan ke admin.
 */
export const backupResource = defineResource({
  name: "backup",
  actions: ["export", "import"],
});
```

- [ ] **Step 2: Daftarkan di registry**

Edit `lib/rbac/resources/index.ts`.

Tambah import (sebelum `clientResource`):

```ts
import { auditResource } from "./audit";
import { backupResource } from "./backup";
import { notificationResource } from "./notification";
import { sessionResource } from "./session";
import { settingsResource } from "./settings";
import { storageResource } from "./storage";
```

Tambah ke `RESOURCES` (urut alphabet):

```ts
export const RESOURCES = {
  audit: auditResource,
  backup: backupResource,
  client: clientResource,
  document: documentResource,
  equipment: equipmentResource,
  equipmentItem: equipmentItemResource,
  map: mapResource,
  notification: notificationResource,
  payment: paymentResource,
  phase: phaseResource,
  profile: profileResource,
  project: projectResource,
  report: reportResource,
  role: roleResource,
  search: searchResource,
  session: sessionResource,
  settings: settingsResource,
  storage: storageResource,
  user: userResource,
} as const;
```

- [ ] **Step 3: Update test `resources/index.test.ts`**

Ubah ekspektasi jumlah resource dari 12 jadi 18:

```ts
  it("memuat 18 resource", () => {
    expect(Object.keys(RESOURCES)).toHaveLength(18);
  });
```

Tambah `@ts-expect-error` untuk resource table-less yang baru (di samping yang sudah ada):

```ts
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _sessionNotScoped: ScopedPermission = "session.read";
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _settingsNotScoped: ScopedPermission = "settings.read";
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _storageNotScoped: ScopedPermission = "storage.read";
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _notificationNotScoped: ScopedPermission = "notification.manage";
// @ts-expect-error resource tanpa tabel tidak boleh jadi ScopedPermission
const _backupNotScoped: ScopedPermission = "backup.export";
```

Dan pastikan `audit.read` masuk ke `ScopedPermission` (punya tabel):

```ts
const _scopedOk: ScopedPermission[] = ["project.read", "payment.void", "document.share", "audit.read"];
```

- [ ] **Step 4: Validasi — test registry & typecheck**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/resources/index.test.ts`
Expected: FAIL dulu karena jumlah masih 12, bukan 18. Setelah update, PASS.

Run: `pnpm typecheck`
Expected: no errors. Test `Permission` union: `const _p: Permission = "audit.read"` harus compile.

- [ ] **Step 5: Commit**

```bash
git add lib/rbac/resources/audit.ts lib/rbac/resources/backup.ts lib/rbac/resources/notification.ts lib/rbac/resources/session.ts lib/rbac/resources/settings.ts lib/rbac/resources/storage.ts lib/rbac/resources/index.ts lib/rbac/resources/index.test.ts
git commit -m "feat(rbac): 6 resource baru — audit, session, settings, storage, notification, backup

Total 11 permission baru. Audit punya tabel audit_log; sisanya table-less.
Superuser otomatis dapat semua lewat turunan PERMISSIONS.map."
```

---

## Task 2: Blocklist `SUPERUSER_ONLY_PREFIXES` di `system-roles.ts`

**Files:**
- Modify: `lib/rbac/system-roles.ts`
- Modify: `lib/rbac/system-roles.test.ts`

**Interfaces:**
- Consumes: permission baru dari Task 1.
- Produces: `adminGrants` = `superuserGrants` minus prefix di blocklist. Admin TIDAK dapat `audit.*`, `session.*`, `storage.*`, `backup.*` — selain `role.*` yang sudah ada.

- [ ] **Step 1: Tambah blocklist & refactor filter**

Di `lib/rbac/system-roles.ts`, tambah konstanta setelah `SYSTEM_ROLES`:

```ts
/**
 * Prefix permission yang TIDAK mengalir ke admin — khusus superuser.
 * `role.*` adalah yang asli; `audit.*`, `session.*`, `storage.*`,
 * `backup.*` ditambah sesuai spec 2026-07-30.
 */
const SUPERUSER_ONLY_PREFIXES = ["role.", "audit.", "session.", "storage.", "backup."];
```

Lalu ubah definisi `adminGrants` dari:

```ts
const adminGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  Object.entries(superuserGrants).filter(([permission]) => !permission.startsWith("role.")),
);
```

Menjadi:

```ts
const adminGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  Object.entries(superuserGrants).filter(
    ([permission]) => !SUPERUSER_ONLY_PREFIXES.some((prefix) => permission.startsWith(prefix)),
  ),
);
```

- [ ] **Step 2: Update test `system-roles.test.ts`**

Tambah 3 test case baru.

**Test 1 — admin TIDAK dapat permission superuser-only yang baru:**

```ts
  it("admin TIDAK dapat permission superuser-only (audit, session, storage, backup)", async () => {
    const grants = await grantsOf("admin");
    const forbidden = ["audit.read", "session.read", "session.revoke", "storage.read", "storage.cleanup", "backup.export", "backup.import"];
    for (const perm of forbidden) {
      expect(grants[perm], perm).toBeUndefined();
    }
  });
```

**Test 2 — admin TETAP dapat permission non-superuser-only yang baru:**

```ts
  it("admin TETAP dapat settings.* dan notification.manage", async () => {
    const grants = await grantsOf("admin");
    expect(grants["settings.read"]).toBe("all");
    expect(grants["settings.update"]).toBe("all");
    expect(grants["notification.manage"]).toBe("all");
  });
```

**Test 3 — superuser dapat SEMUA permission baru:**

```ts
  it("superuser dapat semua 11 permission baru", async () => {
    const grants = await grantsOf("superuser");
    const newPerms = [
      "audit.read", "session.read", "session.revoke",
      "settings.read", "settings.update",
      "storage.read", "storage.cleanup",
      "notification.manage",
      "backup.export", "backup.import",
    ];
    for (const perm of newPerms) {
      expect(grants[perm], perm).toBe("all");
    }
  });
```

Update juga test jumlah permission yang sudah ada. Cari assersi `PERMISSIONS` di test dan pastikan tidak ada yang hardcode angka 54 — ganti dengan `PERMISSIONS.length` atau biarkan dinamis.

- [ ] **Step 3: Run tests**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/rbac/system-roles.test.ts`
Expected: PASS — semua test baru lolos.

- [ ] **Step 4: Full typecheck + lint + full test suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: no errors. `parity.test.ts` tetap PASS karena matrix surveyor/client tidak berubah.

- [ ] **Step 5: Commit**

```bash
git add lib/rbac/system-roles.ts lib/rbac/system-roles.test.ts
git commit -m "feat(rbac): blocklist SUPERUSER_ONLY_PREFIXES — audit, session, storage, backup

Admin TIDAK dapat permission sistem; hanya superuser.
Settings & notification tetap mengalir ke admin otomatis."
```

---

## Task 3: Validasi akhir — permission count & parity

**Files:**
- Modify: `lib/rbac/system-roles.test.ts` (kalau ada hardcode count)
- Verify: `lib/rbac/parity.test.ts` (tidak diubah, harus tetap PASS)

- [ ] **Step 1: Pastikan tidak ada hardcode 54**

Grep seluruh codebase untuk `54` di file test RBAC:

```bash
rg "54" lib/rbac/
```

Kalau ada di test, ganti dengan `PERMISSIONS.length`.

- [ ] **Step 2: Jalankan ulang full test**

```bash
pnpm test
```

Expected: semua PASS. Permission total sekarang 65 (54 + 11).

- [ ] **Step 3: Commit (kalau ada perubahan)**

```bash
git add -A
git commit -m "chore(rbac): update test count ke PERMISSIONS.length"
```

---

## Ringkasan Hasil Akhir

| Resource | Permission | Admin? | Superuser? |
|---|---|---|---|
| `audit` | `audit.read` | ❌ | ✅ `all` |
| `session` | `session.read`, `session.revoke` | ❌ | ✅ `all` |
| `settings` | `settings.read`, `settings.update` | ✅ `all` | ✅ `all` |
| `storage` | `storage.read`, `storage.cleanup` | ❌ | ✅ `all` |
| `notification` | `notification.manage` | ✅ `all` | ✅ `all` |
| `backup` | `backup.export`, `backup.import` | ❌ | ✅ `all` |

**Total permission baru:** 11  
**Total katalog:** 65  
**Superuser-only:** 4 resource (8 permission)  
**Shared admin+superuser:** 2 resource (3 permission)

## Acceptance Criteria

- [ ] `pnpm typecheck` bersih — 11 permission baru menjadi bagian dari `Permission` union.
- [ ] `pnpm lint` bersih.
- [ ] `pnpm test` PASS — termasuk `parity.test.ts` (3 role lama tetap identik).
- [ ] `grantsOf("admin")` TIDAK mengandung `audit.*`, `session.*`, `storage.*`, `backup.*`.
- [ ] `grantsOf("admin")` mengandung `settings.*`, `notification.manage`.
- [ ] `grantsOf("superuser")` mengandung SEMUA 65 permission.
- [ ] `grantsOf("surveyor")` dan `grantsOf("client")` tidak berubah sama sekali.
