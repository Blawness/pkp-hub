# RBAC Granular & Modular — Sub-Proyek 4: Role `superuser` + Admin UI Role Management

Tanggal: 2026-07-24

## Latar

`2026-07-21-rbac-core-engine-design.md` sudah mendaftar "Sub-proyek 4: Admin
UI — Settings → Roles: CRUD role, atur grant + scope, assign role ke user"
sebagai kelanjutan dari core engine. Engine-nya sendiri sudah mendukung
multi-role sejak awal (`user_role_assignment` di-join, scope terluas menang —
lihat `loadEffectivePermissions` di `lib/rbac/context.ts`), tapi belum ada
satu pun cara untuk memakainya: tidak ada UI atau server action untuk
membuat role kustom, mengubah grant sebuah role, atau meng-assign role
tambahan ke user. Tiga role sistem (`admin`/`surveyor`/`client`) hanya
diseed dari kode.

Sekarang dibutuhkan role `superuser` — role tambahan di atas `admin`, khusus
untuk mengelola RBAC itu sendiri (CRUD role, atur grant). `admin` tetap dapat
seluruh permission bisnis, tapi tidak boleh mengubah role/permission. Ini
spec untuk sub-proyek 4 tersebut, dipersempit ke lingkup: role `superuser` +
kemampuan mengelola role. **Impersonate-as-user adalah proyek terpisah,
menyusul setelah ini** — tidak masuk spec ini.

## Tujuan

- Role sistem ke-4: `superuser`. Dapat semua yang dimiliki `admin`, ditambah
  kendali penuh atas role & permission.
- `admin` **tidak** otomatis dapat kendali atas role/permission — harus
  dinaikkan jadi `superuser` secara eksplisit.
- UI di `Settings → Roles` untuk: lihat semua role + grant-nya, buat/ubah/
  hapus role kustom, assign/unassign role ke user.
- Role sistem (`isSystem = true`) tetap sumber kebenaran di kode
  (`system-roles.ts`) — UI hanya bisa **melihatnya**, tidak mengubah grant-nya
  (`seedSystemRoles()` menimpa ulang seluruh grant role sistem tiap deploy,
  jadi perubahan lewat UI akan hilang diam-diam kalau diizinkan).
- Cara bootstrap superuser pertama tanpa lewat UI (karena UI-nya sendiri
  butuh permission yang hanya dimiliki superuser).

### Non-Goal

- Fitur impersonate-as-user (spec terpisah).
- Migrasi `users.role` pgEnum / perubahan `proxy.ts` — `superuser` tidak
  masuk kolom `users.role` sama sekali (lihat Keputusan Desain #1).
- Field-level (`fields`) atau row guard (`guards`) untuk resource `role`.

## Keputusan Desain

### 0. Perbaikan prasyarat: `user_role_assignment` tidak pernah disinkronkan

Ditemukan saat riset spec ini: `loadEffectivePermissions` (sumber kebenaran
permission efektif) membaca murni dari `user_role_assignment`, tapi
`backfillUserRoles()` — satu-satunya kode yang mengisi tabel itu dari
`users.role` — **hanya dipanggil dari `lib/db/seed.ts`**. Tidak ada
`createStaffUser`, `createClientUser`, maupun `setUserRole` di
`lib/actions/users-logic.ts` yang menyentuh `user_role_assignment`.

Akibatnya staf yang dibuat lewat UI *setelah* seed awal, atau yang role-nya
diganti lewat "Ganti role", tidak punya baris `user_role_assignment` yang
benar — `assertCan()` gagal untuk permission apa pun. Ini bug pre-existing,
di luar lingkup awal spec ini, tapi jadi prasyarat: fitur assign-role di sini
dibangun di atas tabel yang sama, jadi memperbaikinya masuk sub-proyek ini.

**Perbaikan:** tambah `roleIdForKey(key: SystemRoleKey)` di
`system-roles.ts` (lookup `roles.id` dari `roles.key`), lalu panggil dari
`users-logic.ts`:
- `createStaffUser` / `createClientUser` — insert satu baris
  `user_role_assignment` untuk role dasarnya begitu user dibuat.
- `setUserRole` — hapus HANYA baris assignment untuk role dasar LAMA (by
  role id), lalu insert baris untuk role dasar BARU. Role tambahan yang
  sudah dipunyai user (mis. `superuser`) tidak disentuh — ini yang
  membedakannya dari `backfillUserRoles()`, yang menimpa dari nol.

`archiveUser`/`restoreUser` sengaja tidak disentuh: user terarsip sudah
diperlakukan logged-out di `auth-guards.ts` dan sesinya langsung diputus, jadi
`getRbacContext()` tidak pernah dievaluasi untuknya sampai dipulihkan.

### 1. `superuser` adalah role tambahan, bukan pengganti kolom `users.role`

`users.role` (pgEnum `admin | surveyor | client`) tetap seperti sekarang —
dipakai murni untuk keputusan area cepat di `proxy.ts` (`/dashboard` vs
`/portal`) dan sebagai "role utama" tampilan. `superuser` **tidak** ditambah
ke enum ini. Sebagai gantinya, seseorang jadi superuser dengan mendapat
**role tambahan** `superuser` lewat `user_role_assignment`, di atas
`users.role = "admin"` yang sudah dia punya. Efektif permission-nya adalah
union keduanya (union-nya sendiri sudah jadi perilaku default engine).

Konsekuensi: nol perubahan pada `proxy.ts`, `lib/auth-guards.ts`, atau
migrasi enum DB. Blast radius kecil, murni penambahan di lapisan RBAC.

### 2. Grant `superuser` = seluruh katalog; `admin` = katalog minus `role.*`

Di `lib/rbac/system-roles.ts`, urutan turunannya dibalik:

```ts
const superuserGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  PERMISSIONS.map((permission) => [permission, permission === "profile.updateOwn" ? "own" : "all"]),
);

const adminGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  Object.entries(superuserGrants).filter(([permission]) => !permission.startsWith("role.")),
);
```

Sifat "permission baru otomatis masuk katalog admin" yang sudah ada sekarang
dipertahankan untuk **keduanya** — satu-satunya pengecualian tetap
`role.*`, yang secara sengaja tidak pernah otomatis mengalir ke `admin`.

`SYSTEM_ROLES` bertambah satu entri:

```ts
{ key: "superuser", name: "Superuser", area: "staff",
  description: "Akses admin penuh, ditambah kendali atas role & permission." }
```

`SystemRoleKey` jadi `"admin" | "surveyor" | "client" | "superuser"`.

### 3. Resource baru `role`, tanpa tabel

`lib/rbac/resources/role.ts`, pola sama seperti `profile` (tidak ada baris
untuk di-scope per user — semua-atau-tidak-sama-sekali):

```ts
export const roleResource = defineResource({
  name: "role",
  actions: ["read", "create", "update", "delete", "assign"],
});
```

`role.assign` dipisah dari `role.update` karena secara konseptual beda:
"ubah definisi & grant sebuah role" vs "pasang/lepas role ke seorang user" —
keduanya bisa saja diberikan terpisah di masa depan meski hari ini selalu
sepaket lewat `superuser`.

### 4. Role sistem immutable dari UI, role kustom bebas

`updateRole`/`deleteRole` di logic layer menolak (error yang ditampilkan apa
adanya, pola sama seperti guard lain di `*-logic.ts`) kalau target
`isSystem === true`. Role kustom (`isSystem = false`) bebas diubah/dihapus
oleh siapa pun yang punya `role.update`/`role.delete`.

### 5. Guard anti-kunci-diri-sendiri di `assignRole`/`unassignRole`

Meniru pola "admin terakhir tidak boleh menyentuh diri sendiri" di
`users-logic.ts`: seorang user tidak boleh unassign role dari **dirinya
sendiri** lewat action ini (harus superuser lain yang melakukannya). Ini
mencegah superuser tunggal tidak sengaja mencabut akses sendiri dan terkunci
dari UI yang sama.

### 6. Bootstrap superuser pertama lewat script, bukan UI

Chicken-and-egg: assign role butuh `role.assign`, yang cuma dipunyai
superuser — jadi superuser pertama tidak bisa dibuat lewat UI. Solusinya
script sekali-pakai `scripts/grant-superuser.ts`, dijalankan manual:

```bash
pnpm db:grant-superuser you@example.com
```

Cari user by email, cari role id `superuser` (hasil `seedSystemRoles()`),
`insert ... onConflictDoNothing` ke `user_role_assignment`. Script
`db:grant-superuser` memakai `--env-file=.env.local` (dev), sama seperti
`db:seed`. Kalau nanti dibutuhkan di prod, ditambah script terpisah
`db:grant-superuser:prod` dengan `--env-file=.env.prod`, mengikuti pola
`db:migrate` / `db:migrate:prod` — bukan lewat flag ad-hoc.

## Rancangan

### Perbaikan sinkronisasi (Keputusan Desain #0)

- `lib/rbac/system-roles.ts` — ekspor `roleIdForKey(key: SystemRoleKey): Promise<string>`.
- `lib/actions/users-logic.ts` — `createStaffUser`, `createClientUser`,
  `setUserRole` memanggilnya untuk menjaga `user_role_assignment` tetap
  sinkron dengan `users.role`, seperti dijelaskan di atas.

### RBAC catalog

- `lib/rbac/resources/role.ts` — resource baru, didaftarkan di
  `lib/rbac/resources/index.ts`.
- `lib/rbac/system-roles.ts` — restrukturisasi `adminGrants`/`superuserGrants`
  seperti Keputusan Desain #2, tambah entri `SYSTEM_ROLES`.

### Server actions (`lib/actions/roles-*`, pola 3-file domain biasa)

- `roles-schemas.ts` — `createRoleSchema`, `updateRoleSchema` (nama,
  deskripsi, daftar `{permission, scope}`), `deleteRoleSchema`,
  `assignRoleSchema` / `unassignRoleSchema` (userId, roleId).
- `roles-logic.ts` — `listRoles`, `createRole`, `updateRole`, `deleteRole`,
  `assignRole`, `unassignRole`. Guard isSystem-immutable (#4) dan
  anti-self-unassign (#5) di sini, diuji langsung tanpa request
  (`roles.test.ts`), sesuai konvensi domain lain.
- `roles.ts` — wrapper `rbacActionClient` tipis, tiap action
  `.metadata({ permission: "role.<action>" })`, `revalidatePath("/dashboard/settings/roles")`.

### UI

- `app/dashboard/settings/roles/page.tsx` — daftar role (badge "Sistem" untuk
  `isSystem`), tabel grant per role (read-only untuk role sistem, editable
  untuk kustom lewat dialog), form buat role baru, dan panel terpisah berisi
  daftar assignment role (user + role) dengan form tambah assignment baru dan
  tombol cabut per baris.
- `app/dashboard/settings/layout.tsx` diperluas jadi tab "User" / "Peran" —
  tab "Peran" hanya dirender kalau `can(ctx, "role.read")`, jadi tidak
  terlihat oleh admin biasa. Tidak menyentuh nav sidebar (`nav-config.ts`)
  karena satu-satunya entri "Pengaturan" di sana sudah menuju area ini;
  navigasi user/peran adalah tab internal di dalam halaman Pengaturan.

### Bootstrap

- `scripts/grant-superuser.ts` + script `db:grant-superuser` di
  `package.json`.

### Tests

- `lib/rbac/system-roles.test.ts` — tambah assersi role `superuser`: grant
  penuh termasuk `role.*`, `admin` **tidak** punya `role.*`.
- `lib/rbac/resources/index.test.ts` — resource `role` terdaftar, jumlah
  permission bertambah 5.
- `lib/actions/roles.test.ts` — CRUD + assign/unassign, guard isSystem, guard
  anti-self-unassign, penolakan untuk role selain superuser.
- `lib/rbac/parity.test.ts` — tidak diubah; membuktikan 3 role lama tetap
  identik, superuser adalah tambahan murni jadi tidak menyentuh parity-nya.

## Urutan Implementasi

1. Perbaikan sinkronisasi `user_role_assignment` (Keputusan Desain #0) + test.
2. Resource `role` + restrukturisasi grant di `system-roles.ts` + testnya.
3. Domain actions `roles-*` + testnya.
4. Script bootstrap `grant-superuser.ts`.
5. UI `Settings → Roles` (tab layout + halaman + dialog role + panel assignment).
