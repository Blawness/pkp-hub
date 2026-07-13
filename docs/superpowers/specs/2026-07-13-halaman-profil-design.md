# Halaman Profil — user mengurus akunnya sendiri

Tanggal: 2026-07-13

## Masalah

Tidak ada satu pun cara bagi user untuk mengurus akunnya sendiri:

- **Nama** hanya bisa diganti admin (`setUserNameAction`, `adminActionClient`). Surveyor dan
  klien tidak punya jalan sama sekali — namanya ditetapkan sekali saat akun dibuat.
- **Password** hanya bisa disetel ulang admin (`setUserPasswordAction`). Surveyor atau klien
  yang ingin mengganti password harus meminta admin melakukannya, dan admin lalu mengetahui
  password orang lain. Itu bukan sekadar merepotkan; itu buruk.

## Ruang lingkup

Yang **masuk**: user (semua role) mengganti **namanya sendiri** dan **password-nya sendiri**.

Yang **tidak masuk**:

- **Email tidak bisa diubah.** Ia identitas login. Menggantinya sendiri berarti user bisa
  mengunci dirinya keluar, dan tanpa verifikasi kepemilikan alamat baru ia bisa dipakai
  membajak alamat orang lain. Butuh alur verifikasi tersendiri — bukan sekarang.
- **Rename oleh admin tetap ada.** Itu untuk mengurus akun orang lain, bukan pengganti ini.
- **`clients.name` tidak tersentuh.** Kolom itu milik halaman Klien (nama perusahaan/kontak).
  Klien yang mengganti nama akunnya hanya mengubah `users.name`.

## Penempatan

Dua route, satu komponen:

```
app/dashboard/profile/page.tsx  ->  <ProfileForm user={user} hasPassword={...} />
app/portal/profile/page.tsx     ->  <ProfileForm user={user} hasPassword={...} />
components/profile/profile-form.tsx   (satu-satunya isi)
```

Staf hidup di shell `/dashboard` (sidebar), klien di `/portal` (topbar). Dua halaman tipis
membuat masing-masing role tetap di dalam shell-nya — navigasi utuh, ada jalan pulang — dengan
harga dua file ~10 baris.

**Profil TIDAK boleh diletakkan di `/dashboard/settings/*`.** Layout di sana memanggil
`requireAdmin()` (`app/dashboard/settings/layout.tsx:13`), jadi surveyor akan ditolak dari
halaman profilnya sendiri.

Guard-nya gratis dan tak perlu diingat: layout `/dashboard` sudah `requireStaff()`, layout
`/portal` sudah `requireClient()`. Halaman cukup memanggil `requireUser()` untuk mendapat user.

Tautan masuk: item **"Profil saya"** di `UserMenu` — komponen itu sudah dirender di sidebar
`/dashboard` dan topbar `/portal`, jadi satu perubahan melayani ketiga role. `href` mengikuti
role: `/dashboard/profile` untuk staf, `/portal/profile` untuk klien.

## Server actions

Berkas baru `lib/actions/profile.ts`, memakai **`authActionClient`** (user apa pun yang login),
BUKAN `adminActionClient`.

### `updateOwnNameAction`

Memakai ulang `setUserName()` di `users-logic.ts` yang sudah ada dan sudah teruji.

**Batas keamanannya satu kalimat:** `userId` diambil dari `ctx.user.id`, **tidak pernah dari
input**. Kalau ia datang dari input, siapa pun yang login bisa mengganti nama siapa pun.
Skema input hanya berisi `name` — tidak ada tempat untuk menyelundupkan `userId`. Ini dikunci
test.

### `changeOwnPasswordAction`

Meneruskan ke `auth.api.changePassword` milik Better Auth:

```ts
await auth.api.changePassword({
  headers: await headers(),
  body: { currentPassword, newPassword, revokeOtherSessions: true },
});
```

Verifikasi password lama ada **di dalam Better Auth**, bukan ditulis ulang di sini.

`revokeOtherSessions: true` — mengganti password memutus sesi di perangkat lain, tapi
mempertahankan sesi yang sedang berjalan. Kalau tidak, user yang mengganti password karena
curiga akunnya diakses orang lain justru membiarkan orang itu tetap masuk.

## Validasi

Memakai skema yang sudah ada, supaya aturan tidak bercabang dua:

- Nama: `setUserNameSchema` — trim, 1–120 karakter.
- Password baru: `passwordSchema` — minimal 10 karakter, maksimal 128. Sama dengan yang
  berlaku saat admin menyetel password.

## Refresh nama di UI

Nama user dirender ulang oleh sidebar (staf) dan topbar (klien), keduanya di **layout**.
Membuang cache halaman profil saja membuat form berubah tapi sidebar tetap menampilkan nama
lama. Jadi action membuang cache layout sesuai role:

```ts
revalidatePath(user.role === "client" ? "/portal" : "/dashboard", "layout");
```

## Penjaga: user tanpa baris credential

Halaman memeriksa apakah user punya baris `accounts` dengan `providerId: "credential"`. Kalau
tidak, form ganti password tidak dirender — diganti pesan yang menjelaskan.

**Ini murni pertahanan, dan itu disengaja.** Keadaannya tidak bisa dicapai lewat aplikasi:
`reset-password` Better Auth membuat baris credential kalau belum ada
(`node_modules/better-auth/dist/api/routes/password.mjs:152`), dan login email/password
mensyaratkan baris itu ada. Jadi user yang belum pernah menyetel password tidak bisa login, dan
yang tidak bisa login tidak bisa membuka halaman ini. Penjaga ini hanya menahan keadaan yang
lahir dari luar aplikasi — misalnya baris `accounts` dihapus langsung di database. Harganya satu
query per muat halaman; kita membayarnya sadar.

## Test

Di `lib/actions/profile.test.ts`, menempel pola `users.test.ts` (DB dev sungguhan, seed
dikembalikan setelahnya):

1. **Ganti nama sendiri berhasil** — dan `role` serta `email` tidak ikut berubah.
2. **Nama user LAIN tidak berubah** — menegakkan bahwa `userId` datang dari sesi, bukan input.
3. **Password lama salah ditolak**, dan password di DB tidak berubah.
4. **Password lama benar diterima** — hash di DB berubah, dan password baru bisa dipakai login.
5. **Sesi lain putus, sesi sendiri bertahan** — invarian dari `revokeOtherSessions: true`.
   Inilah yang paling mudah rusak diam-diam dan paling mahal kalau rusak.

## Yang sengaja tidak dilakukan

- Tidak ada upload foto profil. Tidak diminta, dan menambah permukaan storage baru.
- Tidak ada halaman "sesi aktif". Berguna, tapi fitur lain.
