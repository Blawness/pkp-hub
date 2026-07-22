# RBAC Wiring — Sub-Proyek 2 + 3: Migrasi Call Site + UI Gating

Tanggal: 2026-07-22

Spec ini melanjutkan `2026-07-21-rbac-core-engine-design.md` (sub-proyek 1).
Engine RBAC di `lib/rbac/` sudah lengkap, ter-test, dan terbukti *parity* dengan
pengecekan lama (`lib/rbac/parity.test.ts`) — tapi **belum dipanggil dari satu
call site pun**. Spec ini menyambungkannya, lalu membuang pengecekan role lama.

## Latar

Kontrol akses masih tersebar sebagai ~340 referensi cek-role di 57 file: RSC
(`app/**/page.tsx`), server action (`lib/actions/*.ts`), logic
(`lib/actions/*-logic.ts`), route handler (`app/api/**/route.ts`), dan komponen
UI (`components/**`). Semua lewat `requireRole`/`requireAdmin`/`requireStaff`,
`adminActionClient`/`staffActionClient`, `assertProjectAccess`/
`listProjectsForUser`, atau perbandingan `user.role === "…"` langsung.

Engine sudah menyediakan pengganti yang lebih granular dan sekali-tulis untuk
aturan scope. Tinggal dipakai.

## Tujuan

- Setiap keputusan akses sisi-server lewat `getRbacContext()` + empat fungsi
  publik engine (`can`/`assertCan`, `rbacFilter`, `requireScopedRow`, `redact`)
  plus satu helper baru `scopedColumns`.
- Hapus total helper role lama yang digantikan.
- UI gating deklaratif (`usePermissions()`, `<Can>`, nav-config) menggantikan
  `user.role` di komponen.
- **Nol perubahan perilaku** untuk 3 system role. Parity dibuktikan test di tiap
  langkah.

## Ruang Lingkup

**In scope (sub-proyek 2 + 3):**

- Migrasi seluruh call site sisi-server: logic, action, RSC, route handler.
- `scopedColumns` helper + mengisi `fields` & `guards` resource nyata.
- UI gating: `usePermissions()`, `<Can>`, nav-config berbasis permission.
- Pembuangan helper role lama.

**Non-goal (→ sub-proyek 4):**

- Admin UI untuk CRUD role, atur grant, assign role ke user.
- Mekanisme derive `users.role` dari role primer (nilai `users.role` masih
  tetap seperti sekarang; dipakai `proxy.ts` sebagai area hint).
- Aturan **deny** (ketiadaan grant tetap berarti tidak boleh).

## Keputusan Desain

### 1. `rbacActionClient` tunggal, permission via metadata, fail-closed

`adminActionClient` / `staffActionClient` dihapus. Satu client menggantikannya:

```ts
// lib/actions/safe-action.ts
export const rbacActionClient = actionClient
  .use(async ({ next }) => next({ ctx: { rbac: await getRbacContext() } }))
  .use(async ({ next, ctx, metadata }) => {
    if (!metadata?.permission) throw new Error("rbac: action tanpa permission.");
    assertCan(ctx.rbac, metadata.permission); // gate level-aksi
    return next({ ctx });
  });
```

- Setiap action **wajib** `.metadata({ permission: "x.y" })`. Tanpa itu →
  throw saat dipanggil (fail-closed, sekelas kewajiban memilih
  `adminActionClient` sekarang, tapi per-permission dan bisa di-grep).
- Metadata schema didefinisikan lewat `defineMetadataSchema` next-safe-action
  agar `permission` ter-tipe sebagai `Permission` (typo gagal saat compile).
- Gate level-aksi (`assertCan`) menjawab "boleh melakukan aksi ini sama
  sekali?". Scoping baris (`requireScopedRow`) tetap di `*-logic.ts`, tempat
  id-nya tersedia.

`actionClient` (bare) tetap ada hanya sebagai fondasi internal; aturan "jangan
pernah `createSafeActionClient()` di tempat lain" tetap berlaku.

### 2. `scopedColumns` — `fields` menyetir proyeksi SQL

Satu fungsi baru di `lib/rbac/fields.ts`:

```ts
/**
 * Membangun select-map Drizzle dari SELURUH kolom tabel resource, MEMBUANG
 * kolom yang gating-permission-nya tidak dimiliki `ctx`. Kolom sensitif tidak
 * pernah ikut ter-SELECT — bukan diambil lalu dihapus. Menjaga invarian PRD
 * "bentuk hasil query, bukan disembunyikan di UI".
 */
export function scopedColumns(resource: AnyResource, ctx: RbacContext): Record<string, PgColumn>;
```

- Sumber kebenaran tunggal: `fields` map yang sama juga tetap dipakai `redact()`
  sebagai fallback pasca-query untuk jalur baca satu-baris yang sudah terlanjur
  mengambil baris penuh (mis. hasil `requireScopedRow`).
- Komputasi internal server yang butuh kolom tersembunyi (mis.
  `getPortalProgress` butuh `weight`) memakai query langsungnya sendiri;
  `scopedColumns` hanya mengatur bentuk baris yang **dikembalikan ke pemanggil**.

**Batasan tipe → tiga action baru.** `fields` hanya boleh merujuk permission
resource yang sama (`fields?: Partial<Record<keyof Row, \`${Name}.${Action}\`>>`).
Jadi tiga action baca ditambahkan ke resource yang relevan dan ke seed matrix:

| permission baru | admin | surveyor | client | kolom yang digating |
|---|---|---|---|---|
| `project.readFinance` | all | – | own | `projectValue, paymentStatus, paymentNotes` |
| `equipment.readCost` | all | – | – | `purchasePrice, purchaseDate` |
| `phase.readInternal` | all | assigned | – | `description, weight, assignedSurveyorId` |

`redact`/`scopedColumns` memakai `can()` (level-aksi, mengabaikan scope), jadi
gating kolom bersifat semua-atau-tidak per-`ctx` — cocok dengan perilaku
sekarang (admin lihat, surveyor tidak; client lihat finance proyeknya sendiri
karena `project.readFinance:own` → `can()` true).

Menambah action ke resource **menambah baris seed** — ditambahkan idempoten ke
`system-roles.ts` dan diperiksa `parity.test.ts`/matrix test.

### 3. Guard hanya untuk kondisi satu-baris; invarian lintas-baris tetap di logic

`guards` (dicek `requireScopedRow` setelah baris diambil) hanya menyerap kondisi
status/arsip satu baris:

- `equipment.borrow` → tolak kalau `condition !== "tersedia"` atau `archivedAt`
  tidak null. Pesan Indonesia dikembalikan apa adanya.

Invarian lintas-baris tetap jadi cek eksplisit di `*-logic.ts` (tidak dipaksa ke
bentuk `guard(row)`):

- "admin aktif terakhir" (`user.setRole` / `user.archive`).
- "isi nilai proyek dulu" (`payment.record`, butuh baris `project`).
- "arsipkan unit dulu" (`equipmentItem.archive`/delete, agregat unit).
- Anti double-checkout tetap ditegakkan partial unique index DB (bukan guard).

### 4. Signature logic berubah: `(user)` → `(ctx)`

Fungsi di `*-logic.ts` berubah dari `(user: SessionUser, input)` menjadi
`(ctx: RbacContext, input)`. Konsekuensi:

- Test unit membangun `ctx` lewat fixture baru `makeTestContext(role)` (atau
  memuat permission efektif dari seed) alih-alih objek user telanjang.
- `requireStaff(user)` / `requireClientRole(user)` per-logic dihapus; gate-nya
  jadi `assertCan(ctx, …)` + scoping `rbacFilter`/`requireScopedRow`.

### 5. UI gating deklaratif (sub-proyek 3)

- **Server → client bridge.** Layout `app/dashboard/layout.tsx` dan
  `app/portal/layout.tsx` menghitung set permission efektif di server
  (`getRbacContext`) lalu menaruhnya ke sebuah client `PermissionsProvider`.
  Hanya daftar permission (bukan scope, bukan data) yang menyeberang.
- `usePermissions()` → `{ can(permission): boolean }`.
- `<Can permission="x.y">…</Can>` — render anak hanya kalau diizinkan. Ini
  **kosmetik**; server tetap penegak sebenarnya.
- `components/dashboard/nav-config.ts`: tiap entri dapat field `permission`;
  `sidebar.tsx` / `mobile-nav.tsx` memfilter berdasarkan itu, bukan `role`.
- Perbandingan `user.role === "admin"` di komponen (mis. `user-row-actions.tsx`,
  `project-form-dialog.tsx`, `client-form-dialog.tsx`) → `usePermissions()`/`<Can>`.

## Yang Dihapus vs Dipertahankan

**Dihapus** dari `lib/auth-guards.ts` dan `lib/actions/safe-action.ts`:
`requireRole`, `requireAdmin`, `requireStaff`, `requireClient`,
`assertProjectAccess`, `listProjectsForUser`, `adminActionClient`,
`staffActionClient`, dan `requireStaff`/`requireClientRole` lokal di
`*-logic.ts`.

**Dipertahankan:** `getSession`, `requireUser`, `homeForRole`,
`getClientIdForUser` (dipakai `context.ts`), `Role`/`SessionUser` type, dan
`proxy.ts` (gerbang cookie kasar, baca `users.role` sebagai area hint).

## Peta Migrasi per Resource

Ringkas transformasi yang berulang di tiap domain:

| Lama | Baru |
|---|---|
| `adminActionClient` | `rbacActionClient` + `.metadata({ permission })` |
| `staffActionClient` | idem, permission staf-nya |
| `requireStaff()` di RSC | muat `ctx`, `db.select(scopedColumns(res, ctx)).where(rbacFilter(ctx, "x.read"))` |
| `assertProjectAccess(id, user)` | `requireScopedRow(ctx, "x.read", id)` |
| `listProjectsForUser(user)` | `db.select(...).where(rbacFilter(ctx, "project.read"))` |
| proyeksi kolom manual (finance/cost/internal) | `scopedColumns(resource, ctx)` |
| trim field pasca-query satu baris | `redact(ctx, resource, row)` |

Statistik dashboard tetap disusun di atas `rbacFilter(ctx, "project.read")`
(tidak ada resource `dashboard`), agar angkanya tak pernah melenceng dari daftar
proyek yang dilihat user.

## Testing

Tiga jaring pengaman, semua sudah ada sebagian:

1. **Parity test (`parity.test.ts`).** Sudah membuktikan `rbacFilter`/
   `requireScopedRow` == `listProjectsForUser`/`assertProjectAccess` lama untuk
   `project` & `document`. Selama helper lama belum dihapus, test ini tetap jadi
   oracle. Sebelum menghapus helper lama, diganti jadi snapshot id-set per role.
2. **Test domain (`*.test.ts`).** Tiap file logic domain sudah punya test hit
   Neon dev branch. Setelah signature `(user)`→`(ctx)`, test dibangun ulang
   dengan `makeTestContext`. Ekspektasi perilaku **tidak berubah**.
3. **Matrix test system-roles.** Bertambah 3 baris (`project.readFinance`,
   `equipment.readCost`, `phase.readInternal`). Sel matrix menunjuk grant seed
   yang persis.

`pnpm typecheck` + `pnpm lint` bersih tiap pass. Metadata ber-tipe membuat
permission ngawur gagal saat compile.

## Sequencing

Per-domain, tiap pass berdiri sendiri dan hijau sebelum lanjut. Helper lama tetap
hidup sampai pass terakhir, jadi aplikasi shippable di antara pass.

1. Fondasi: `rbacActionClient`, `scopedColumns`, `makeTestContext`, tiga action
   baru + seed + matrix test.
2. `project` (punya parity oracle) → `document` (punya parity oracle).
3. `phase` → `map` → `payment`/`finance`.
4. `equipment` → `equipmentItem`.
5. `client` → `user` → `profile`.
6. `dashboard` (RSC statistik) → `portal` (list, phases, progress).
7. Route handler: `app/api/export`, `app/api/documents/upload-init`,
   `app/api/equipment/upload-init`, `app/api/storage`.
8. UI gating: `PermissionsProvider`, `usePermissions`, `<Can>`, nav-config,
   komponen.
9. Pass terakhir: hapus helper lama; ubah `parity.test.ts` jadi snapshot;
   `pnpm typecheck`/`lint`/`test` bersih; grep memastikan nol `user.role ===`
   dan nol referensi helper lama tersisa di luar `proxy.ts`/`context.ts`.

## Error Handling

| Kejadian | Perilaku |
|---|---|
| Action tanpa `.metadata({ permission })` | Throw saat dipanggil (fail-closed) |
| `assertCan` gagal | Error pesan Indonesia ditampilkan ke user |
| `requireScopedRow` tak menemukan baris | `notFound()` — tak bedakan "tak ada" dari "bukan punyamu" |
| Guard menolak | Pesan Indonesia guard apa adanya |
| Komponen `<Can>` tanpa izin | Anak tidak dirender (kosmetik; server tetap menegakkan) |

## Kriteria Selesai

- [ ] `rbacActionClient` + metadata ber-tipe; `adminActionClient`/
      `staffActionClient` dihapus.
- [ ] `scopedColumns` + `fields`/`guards` terisi untuk resource yang relevan.
- [ ] Tiga action baca baru di-seed & diperiksa matrix test.
- [ ] Seluruh call site sisi-server memakai engine; helper role lama dihapus.
- [ ] UI gating: `usePermissions`/`<Can>`/nav-config; nol `user.role ===` di
      komponen.
- [ ] `parity.test.ts` diubah jadi snapshot setelah helper lama hilang; semua
      test hijau.
- [ ] `pnpm typecheck` & `pnpm lint` bersih.
- [ ] Perilaku 3 system role identik dengan sebelum migrasi.
