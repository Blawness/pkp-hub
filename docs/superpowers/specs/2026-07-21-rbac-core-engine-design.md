# RBAC Granular & Modular — Sub-Proyek 1: Core Engine + Parity

Tanggal: 2026-07-21

## Latar

Kontrol akses sekarang berupa perbandingan string role (`user.role === "admin"`)
yang tersebar di **228 titik** di 50+ file — RSC, server action, route handler,
sampai komponen UI. Menambah role baru berarti menyunting semua titik itu.
Menambah izin yang lebih halus dari "admin / bukan admin" tidak mungkin tanpa
menambah role baru ke `pgEnum`, yang berarti migrasi DB.

Selain itu aturan scoping baris ditulis **dua kali**: sekali di
`assertProjectAccess` dan sekali lagi di `listProjectsForUser`
(`lib/auth-guards.ts`). Komentar di file itu sendiri sudah mewanti-wanti kalau
keduanya melenceng, proyek bisa dibuka lewat URL langsung tapi tidak muncul di
daftar. Duplikasi itu adalah bug yang menunggu.

## Tujuan

Membangun engine RBAC di `lib/rbac/` yang:

- Izinnya granular per (resource, action) dengan **scope baris** menyatu di
  dalamnya.
- Role-nya baris DB yang bisa ditambah admin, tanpa migrasi dan tanpa deploy.
- Aturan scope tiap resource ditulis **satu kali** dan dipakai bersama oleh
  jalur "daftar" maupun "satu baris" — mustahil melenceng.
- Menambah fitur baru = menambah **satu file** di `lib/rbac/resources/`.
- Nol perubahan perilaku saat mendarat.

## Pemecahan Sub-Proyek

| # | Sub-proyek | Isi |
|---|---|---|
| **1** | **Core engine + parity** — *spec ini* | `lib/rbac/`, tabel `role`/`role_permission`/`user_role`, seed 3 system role identik perilakunya dengan sekarang |
| 2 | Migrasi call site | Ganti 228 titik cek role per domain, hapus `requireRole`/`adminActionClient`, isi `fields` & `guards` |
| 3 | UI gating | `usePermissions()`, `<Can>`, nav-config deklaratif |
| 4 | Admin UI | Settings → Roles: CRUD role, atur grant + scope, assign role ke user |

Sub-proyek 2–4 adalah **non-goal** spec ini dan akan punya spec sendiri.

### Non-Goal sub-proyek 1

- Tidak ada halaman atau komponen UI baru.
- Tidak ada call site lama yang diubah. `requireRole`, `requireAdmin`,
  `requireStaff`, `adminActionClient`, `staffActionClient` tetap ada dan tetap
  dipakai seperti sekarang.
- Resource nyata **tidak** mendeklarasikan `fields` maupun `guards`. Engine
  mendukung keduanya dan mengetesnya lewat resource fixture, tapi mengisinya
  untuk resource nyata mengubah perilaku — itu pekerjaan sub-proyek 2.
- Tidak ada aturan **deny**. Ketiadaan grant sudah berarti tidak boleh; deny
  rule yang menimpa allow adalah sumber bug RBAC nomor satu.

## Keputusan Desain

### 1. Permission di kode, role di DB

Katalog permission hidup di TypeScript (type-safe, bisa di-grep, ikut code
review). Role dan mapping role→permission hidup di DB (bisa diedit admin di
sub-proyek 4).

### 2. Grant = (permission, scope)

Satu grant bukan boolean, tapi pasangan izin + jangkauan baris:

```
role_permission(roleId, permission = "project.read", scope = "assigned")
```

Scope: `all` | `assigned` | `own`. Tiap resource mendefinisikan arti ketiganya
sebagai predikat SQL Drizzle.

### 3. Nama permission selalu tepat dua segmen: `resource.action`

`project.read`, `project.readFinance`, `payment.void`, `equipment.checkout`.
Tanpa wildcard, tanpa nesting. Gampang di-grep, gampang di-parse, gampang
dibaca.

### 4. `permission` disimpan `text`, bukan `pgEnum`

Kalau enum, setiap fitur baru butuh migrasi DB — persis yang bikin sistem
sekarang tidak modular. Gantinya:

- **Tulis:** divalidasi Zod terhadap katalog kode di boundary tulis, jadi
  permission ngawur tidak bisa masuk lewat UI.
- **Baca:** permission yang tidak dikenal katalog **diabaikan** (fail-closed).
  Menghapus fitur tidak meninggalkan grant hantu yang berbahaya.

### 5. Union multi-role: scope tertinggi menang

Urutan `all > assigned > own`. User dengan Surveyor(`project.read:assigned`) +
Bendahara(`project.read:all`) efektif punya `all`.

### 6. `users.role` turun pangkat jadi area hint

`proxy.ts` hanya baca cookie dan tidak boleh menyentuh DB, jadi ia butuh
petunjuk kasar "orang ini ke `/dashboard` atau `/portal`". Kolom `users.role`
tetap ada untuk itu — tapi **bukan lagi sumber kebenaran izin**. Sumber
kebenaran pindah ke `user_role` → `role_permission`. Ke depan `users.role`
di-*derive* dari `area` role primer, bukan diedit langsung (mekanisme derive-nya
dipasang di sub-proyek 4, saat role bisa diubah; di sub-proyek 1 nilainya tidak
pernah berubah).

### 7. Hapus role: hanya non-system dan hanya kalau tidak dipakai

Tidak pakai soft-delete — beda dengan users/clients/equipment, karena tidak ada
FK riwayat yang menunjuk ke `role`. Menghapus role yang masih dipegang user
ditolak dengan error jelas, bukan cascade diam-diam. (Penegakannya di
sub-proyek 4; di sub-proyek 1 cukup constraint dan helper-nya.)

### 8. Permission efektif di-load per request, di-dedup `cache()`

Satu query join per request walau `getRbacContext()` dipanggil 50×. Perubahan
role langsung berefek — konsisten dengan `disableCookieCache: true` yang sudah
jadi prinsip di `lib/auth-guards.ts`. Tidak disimpan di sesi/JWT (butuh
re-login) dan tidak di-cache in-memory ber-TTL (tiap instance serverless punya
cache sendiri).

## Data Model

Tambahan di `lib/db/schema.ts`, satu migrasi.

```ts
export const roleArea = pgEnum("role_area", ["staff", "client"]);
export const permissionScope = pgEnum("permission_scope", ["all", "assigned", "own"]);

export const roles = pgTable("role", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),   // slug stabil: "admin", "surveyor", "bendahara"
  name: text("name").notNull(),          // label Indonesia: "Bendahara"
  description: text("description"),
  area: roleArea("area").notNull(),      // menentukan /dashboard vs /portal
  isSystem: boolean("is_system").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permission",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permission: text("permission").notNull(),
    scope: permissionScope("scope").notNull().default("own"),
  },
  (t) => [unique("role_permission_uniq").on(t.roleId, t.permission)],
);

export const userRoles = pgTable(
  "user_role",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);
```

**Migrasi data:** setelah tabel dibuat, seed 3 system role (`isSystem = true`)
beserta grant-nya (matrix di bawah), lalu isi `user_role` dari nilai
`users.role` yang ada — satu baris per user. Idempoten: aman dijalankan ulang.

## Engine API

```
lib/rbac/
  types.ts             — Scope, Permission, RbacContext
  define-resource.ts   — defineResource() + inferensi tipe
  resources/
    project.ts         — satu file per resource, self-contained
    client.ts
    phase.ts
    map.ts
    document.ts
    payment.ts
    equipment.ts
    equipment-item.ts
    user.ts
    profile.ts
    report.ts
    index.ts           — registry + katalog permission gabungan
  context.ts           — getRbacContext(), dibungkus React cache()
  can.ts               — can(), assertCan()
  filter.ts            — rbacFilter()
  scoped-row.ts        — requireScopedRow()
  guards.ts            — checkGuard()
  fields.ts            — redact()
  *.test.ts
```

### Bentuk sebuah resource

```ts
// lib/rbac/resources/project.ts
export const projectResource = defineResource({
  name: "project",
  table: projects,
  actions: ["read", "create", "update", "assignSurveyor", "changeStatus", "updateFinance"],

  // Dipakai OLEH rbacFilter() DAN requireScopedRow() — tidak bisa melenceng.
  scopes: {
    all: () => sql`true`,
    assigned: (ctx) => or(
      eq(projects.assignedSurveyorId, ctx.user.id),
      exists(db.select({ one: sql`1` }).from(projectPhases).where(
        and(eq(projectPhases.projectId, projects.id),
            eq(projectPhases.assignedSurveyorId, ctx.user.id)),
      )),
    ),
    own: (ctx) => eq(projects.clientId, ctx.clientId ?? NO_CLIENT),
  },

  // Didukung engine, TIDAK diisi di sub-proyek 1 (lihat Non-Goal).
  guards: {},
  fields: {},
});
```

`table` menyediakan tabel Drizzle beserta kolom `id`-nya, yang dibutuhkan
`requireScopedRow` untuk menyusun `WHERE id = ? AND <filter>`.

**Resource tanpa tabel.** `profile` dan `report` tidak memetakan ke satu tabel;
keduanya hanya dipakai lewat `can()`. Untuk resource seperti itu
`table` dan `scopes` dikosongkan, dan memanggil `rbacFilter`/`requireScopedRow`
padanya adalah error tipe — bukan error runtime.

### Empat fungsi publik

```ts
// 1. AKSI — boleh melakukan ini sama sekali? (tanpa melihat baris)
if (!can(ctx, "project.create")) …

// 2. DAFTAR — selalu SQL boolean, tidak pernah undefined
db.select().from(projects)
  .where(and(rbacFilter(ctx, "project.read"), eq(projects.status, "aktif")))
//   all      → sql`true`
//   assigned → or(assignedSurveyorId = me, exists(phase…))
//   own      → clientId = myClientId
//   tanpa izin → sql`false`   → array kosong, bukan crash, bukan bocor

// 3. SATU BARIS — filter yang SAMA, jadi mustahil beda dengan daftar
const project = await requireScopedRow(ctx, "project.update", projectId);
//   SELECT … WHERE id = ? AND <filter yang sama persis>
//   kosong → notFound(); lalu guards[action](row) → error kalau ditolak

// 4. FIELD — buang kolom yang tidak boleh dilihat
return redact(ctx, "project", project);
```

**Kenapa `rbacFilter` selalu mengembalikan SQL** (bukan `SQL | undefined`): satu
bentuk untuk semua kasus, langsung masuk `and()`, dan kasus "tidak punya izin"
otomatis jadi array kosong alih-alih bergantung pada pemanggil ingat menulis
`if`. Lupa menangani tetap aman.

**Kenapa `requireScopedRow` query ulang pakai filter yang sama** alih-alih
mengecek baris di JS: ini membunuh permanen bug "guard dan list beda aturan"
yang diwanti-wanti `lib/auth-guards.ts:165`. Aturan scope ditulis sekali saja.

### Context per request

```ts
export type RbacContext = {
  user: SessionUser;
  permissions: Map<Permission, Scope>;
  /** `clients.id` yang tertaut ke user portal ini, atau null. */
  clientId: string | null;
};

export const getRbacContext = cache(async (): Promise<RbacContext> => {
  const user = await requireUser();                            // guard yang sudah ada
  const [permissions, clientId] = await Promise.all([
    loadEffectivePermissions(user.id),                         // 1 query join
    getClientIdForUser(user.id),                               // helper yang sudah ada
  ]);
  return { user, permissions, clientId };
});
```

**Kenapa `clientId` ikut di context, bukan dilihat di dalam fungsi scope:**
fungsi scope harus **sinkron** — ia mengembalikan predikat SQL yang disusun ke
dalam `and()`, bukan menjalankan query. Semua yang perlu di-fetch untuk menyusun
predikat harus sudah ada di context. `clientId` adalah satu-satunya kasus itu
sekarang; kalau nanti ada yang lain, ia ikut ke sini juga dan tetap satu round
trip berkat `Promise.all` + `cache()`.

`NO_CLIENT` adalah sentinel string yang tidak mungkin cocok dengan `clients.id`
mana pun, sehingga user portal yang belum tertaut ke baris client menghasilkan
himpunan kosong — bukan `undefined` yang bocor jadi "tanpa filter".

### Type-safety

`defineResource` menurunkan tipe permission sebagai `` `${name}.${action}` ``.
Registry menggabungkan seluruh resource jadi union `Permission`. Typo seperti
`"project.raed"` gagal saat compile, bukan saat runtime.

## Matrix Parity

Grant yang di-seed untuk 3 system role. `–` = tidak ada grant. Matrix ini
diturunkan dari audit call site yang ada sekarang dan **harus** menghasilkan
perilaku identik.

| permission | admin | surveyor | client |
|---|---|---|---|
| `project.read` | all | assigned | own |
| `project.create` / `.update` / `.assignSurveyor` | all | – | – |
| `project.changeStatus` | all | assigned | – |
| `project.updateFinance` | all | – | – |
| `phase.read` | all | assigned | own |
| `phase.create` / `.update` / `.delete` / `.reorder` | all | – | – |
| `phase.setStatus` / `.updateNote` | all | assigned | – |
| `map.read` | all | assigned | own |
| `map.write` | all | assigned | – |
| `document.read` | all | assigned | own¹ |
| `document.upload` | all | assigned | – |
| `document.share` / `.delete` | all | – | – |
| `payment.read` | all | – | own |
| `payment.record` / `.void` / `.regenerateReceipt` | all | – | – |
| `equipment.read` | all | **all** | – |
| `equipment.borrow` / `.return` | all | **all** | – |
| `equipment.create` / `.update` / `.archive` / `.correctUsage` | all | – | – |
| `equipmentItem.create` / `.update` / `.archive` | all | – | – |
| `client.read` / `.create` / `.update` / `.archive` | all | – | – |
| `user.read` / `.create` / `.update` / `.setRole` / `.archive` / `.restore` | all | – | – |
| `profile.updateOwn` | own | own | own |
| `report.export` | all | – | – |

Tidak ada resource `dashboard`. Statistik dashboard di-scope dengan
menyusun query-nya di atas `rbacFilter(ctx, "project.read")` — angkanya harus
konsisten dengan daftar proyek yang dilihat user, dan menaruhnya di resource
terpisah justru membuka celah keduanya melenceng.

¹ Scope `own` untuk dokumen = proyek milik client saya **dan**
`isSharedWithClient = true`. Kondisi tambahan itu tinggal di dalam fungsi scope
resource-nya, bukan jadi konsep baru di engine.

`equipment.*` untuk surveyor scope-nya `all` — bukti model grant+scope tidak
memaksa semua hal berbentuk role. Inventaris memang tidak per-proyek, dan itu
terekspresikan langsung.

## Testing

Tiga lapis. Test hit Neon dev branch seperti biasa (`fileParallelism: false`,
setup data self-contained per file).

1. **Matrix test (table-driven).** Matrix di atas ditulis sebagai fixture; test
   menyatakan setiap sel terhadap hasil seed. Kalau seseorang mengubah seed,
   test menunjuk sel persisnya.
2. **Engine test (logika murni + resource fixture).**
   - `rbacFilter` menghasilkan predikat SQL `false` saat tanpa izin.
   - Union multi-role mengambil scope tertinggi.
   - Permission tak dikenal katalog diabaikan.
   - User tanpa role sama sekali = nol izin.
   - `guards` menolak dan mengembalikan pesan; `redact` membuang field —
     keduanya diuji lewat resource fixture, bukan resource nyata.
   - Registry menolak nama resource ganda / action ganda saat dimuat.
3. **Equivalence test — bukti parity.** Pada data seed yang sama, untuk tiap
   role:
   - `db.select().where(rbacFilter(ctx, "project.read"))` menghasilkan himpunan
     id yang **identik** dengan `listProjectsForUser(user)` lama.
   - `requireScopedRow(ctx, "project.read", id)` `notFound()` pada kasus yang
     sama persis dengan `assertProjectAccess(id, user)` lama.
   - Hal yang sama untuk `document.read` (termasuk aturan `isSharedWithClient`).

Seluruh test lama (`auth-guards.test.ts`, `auth-security.test.ts`, dan 20+
`*.test.ts` domain) harus tetap hijau **tanpa diubah** — karena tidak ada call
site yang disentuh.

## Error Handling

| Kejadian | Perilaku |
|---|---|
| Permission di DB tidak ada di katalog kode | Diabaikan (fail-closed), `console.warn` sekali per request |
| User tanpa role sama sekali | Nol izin; `can()` false, `rbacFilter` → predikat SQL `false` |
| User diarsipkan | Sudah tertangani `getSession()` — dianggap belum login |
| `requireScopedRow` tidak menemukan baris | `notFound()` — tidak pernah membedakan "tidak ada" dari "bukan punyamu" |
| Guard menolak | Error dengan pesan Indonesia yang ditampilkan ke user |
| Resource/permission tidak terdaftar di registry | Throw saat modul dimuat, bukan saat request |

## Kriteria Selesai

- [ ] Migrasi tabel `role` / `role_permission` / `user_role` diterapkan ke dev DB.
- [ ] Seed 3 system role + grant sesuai matrix; idempoten.
- [ ] `lib/rbac/` lengkap dengan 11 resource, hanya `actions` + `scopes` terisi.
- [ ] Tiga lapis test hijau.
- [ ] Seluruh test lama hijau tanpa diubah.
- [ ] `pnpm lint` dan `pnpm typecheck` bersih.
- [ ] Tidak ada call site yang diubah; perilaku aplikasi identik.
