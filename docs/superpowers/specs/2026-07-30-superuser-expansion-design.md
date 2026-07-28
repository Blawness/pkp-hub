# Ekspansi Superuser — 6 Resource Baru

Tanggal: 2026-07-30

## Latar

Role `superuser` (spec `2026-07-24-role-superuser-design.md`) saat ini memegang
seluruh 54 permission di katalog — tapi katalog itu sendiri hanya mencakup fitur
bisnis (proyek, klien, peta, dokumen, dsb.). Tidak ada permission untuk
kemampuan tingkat sistem: baca log audit, kelola sesi user, atur konfigurasi
sistem, lihat penggunaan storage, kelola notifikasi, atau ekspor/impor data
penuh.

Akibatnya superuser secara teknis "memegang semua yang ada", tapi tidak ada
yang benar-benar **hanya superuser** selain `role.*` (5 permission). Enam
resource baru ini memperluas katalog ke ranah sistem — dan beberapa di
antaranya sengaja **tidak** mengalir ke admin, mempertegas mengapa superuser
ada sebagai role terpisah.

## Tujuan

- 6 resource baru: `audit`, `session`, `settings`, `storage`, `notification`,
  `backup` — total 11 permission baru.
- Beberapa resource **superuser-only** (tidak diberikan ke admin), mengikuti
  pola yang sama dengan `role.*`: difilter dari `adminGrants` di
  `system-roles.ts`.
- Resource yang bersifat bisnis/operasional tetap mengalir ke admin otomatis.
- Untuk resource yang tabelnya sudah ada (`audit_log`), langsung dipasang
  `table` + `scopes`; sisanya table-less seperti `role` / `search`.

### Non-Goal

- Implementasi UI penuh untuk setiap resource. Spec ini hanya mendaftarkan
  resource + permission + matrix grant. UI masing-masing resource adalah
  sub-proyek terpisah yang mengikuti spec-nya sendiri.
- Migrasi DB baru. `audit_log` sudah ada; `sessions` sudah ada dari Better
  Auth. Resource lainnya table-less.
- Mengubah perilaku `proxy.ts` atau `auth-guards.ts`.

## Keputusan Desain

### 1. Superuser-only vs shared dengan admin

Tidak semua resource baru bersifat "hanya superuser". Kategorisasinya:

| Resource | Diberikan ke Admin? | Alasan |
|---|---|---|
| `audit` | ❌ Superuser-only | Log audit bersifat forensik — admin operasional tidak perlu membaca jejak siapa ngapain. |
| `session` | ❌ Superuser-only | Mencabut sesi user lain adalah tindakan keamanan tingkat tinggi. |
| `settings` | ✅ Admin juga | Konfigurasi studio (nama, logo) adalah operasional, bukan keamanan. |
| `storage` | ❌ Superuser-only | Membersihkan file yatim di R2 bisa destruktif. |
| `notification` | ✅ Admin juga | Mengelola template notifikasi adalah operasional. |
| `backup` | ❌ Superuser-only | Ekspor/impor data penuh adalah tindakan destruktif + privasi. |

### 2. Cara memfilter dari `adminGrants`

Saat ini filter-nya hanya `!permission.startsWith("role.")`. Dilebarkan jadi
prefix blocklist:

```ts
const SUPERUSER_ONLY_PREFIXES = ["role.", "audit.", "session.", "storage.", "backup."];

const adminGrants: Partial<Record<Permission, Scope>> = Object.fromEntries(
  Object.entries(superuserGrants).filter(
    ([permission]) => !SUPERUSER_ONLY_PREFIXES.some((p) => permission.startsWith(p)),
  ),
);
```

Resource baru yang TIDAK masuk blocklist (`settings`, `notification`)
otomatis mengalir ke admin seperti biasa.

### 3. Resource `audit` punya tabel, sisanya table-less

- `audit` → tabel `audit_log` sudah ada di `lib/db/schema.ts`, scope `all`
  saja (superuser melihat seluruh log).
- `session` → table-less, action-nya query `sessions` table Better Auth
  langsung dari logic layer.
- `settings` → table-less, baca/tulis dari config (env / DB table settings
  kalau nanti dibuat; untuk sekarang table-less dulu).
- `storage` → table-less, action-nya query R2 API, bukan DB.
- `notification` → table-less.
- `backup` → table-less.

### 4. Tidak ada field-level scoping untuk resource baru

Resource `audit` punya tabel, tapi tidak ada field yang perlu disembunyikan
per role (superuser melihat semua kolom). Kalau nanti ada kebutuhan, tinggal
ditambah `fields` seperti di resource `project` / `equipment`.

### 5. Scope `all` untuk semua resource baru

Superuser selalu melihat/melakukan semuanya tanpa batasan baris.
Resource `session` secara teknis bisa di-scope (superuser lain tidak bisa
mencabut sesi superuser lain?), tapi untuk v1: `all` — kepercayaan penuh.

## Rancangan

### Resource catalog (`lib/rbac/resources/`)

6 file baru:

| File | Permission |
|---|---|
| `audit.ts` | `audit.read` |
| `session.ts` | `session.read`, `session.revoke` |
| `settings.ts` | `settings.read`, `settings.update` |
| `storage.ts` | `storage.read`, `storage.cleanup` |
| `notification.ts` | `notification.manage` |
| `backup.ts` | `backup.export`, `backup.import` |

Total: 11 permission baru. Total katalog: 65.

### Matrix grant (`lib/rbac/system-roles.ts`)

- `superuserGrants` — otomatis bertambah 11 (turunan `PERMISSIONS.map`).
- `adminGrants` — bertambah 3 (`settings.*` + `notification.manage`), tidak
  dapat 8 lainnya.
- `surveyor` & `client` — tidak berubah.

### Blocklist

`SUPERUSER_ONLY_PREFIXES` disimpan di `system-roles.ts` sebagai konstanta
internal. Tidak diekspor — hanya dipakai untuk menghasilkan `adminGrants`.

## Urutan Implementasi

1. Buat 6 file resource di `lib/rbac/resources/`.
2. Daftarkan di `lib/rbac/resources/index.ts`.
3. Update `system-roles.ts`: blocklist + update test.
4. Update test `resources/index.test.ts` dan `system-roles.test.ts`.
5. (Future) UI + logic untuk masing-masing resource — sub-proyek terpisah.
