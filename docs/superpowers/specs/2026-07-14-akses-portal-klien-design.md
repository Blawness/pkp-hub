# Desain — Akses Portal Klien (undangan & pembuatan manual)

- **Tanggal:** 2026-07-14
- **Penulis:** opencode
- **Status:** Disetujui (desain), menunggu implementasi

## 1. Tujuan & konteks

Klien harus bisa masuk ke portal (`/portal`) lewat `/login` — mekanisme login
sudah benar: `components/auth/login-form.tsx` mengalihkan user dengan
`role === "client"` ke `/portal`. Yang **belum ada** adalah jalan di UI bagi
admin untuk memberi klien sebuah akun portal:

- `inviteClientUser` (`lib/actions/invite-client-user.ts`) sudah ada, tapi
  **tidak dipanggil dari UI mana pun** — hanya disebut di komentar.
- `users-logic.ts:24-27` sengaja melarang pembuatan user `client` lewat
  `createStaffUser` karena user klien yang yatim (tanpa tautan `clients`)
  tidak bisa melihat apa pun di portal.

Akibatnya: klien yang ditambahkan lewat halaman Klien tidak bisa pernah diundang,
tidak punya password, dan tidak bisa login. Ini celah fungsional yang membuat
"portal login buat klien" terasa tidak ada.

## 2. Cakupan

**Masuk:**
- Tombol "Undang ke portal" pada halaman detail klien (`/dashboard/clients/[id]`)
  yang memanggil `inviteClientUser` yang sudah ada.
- Pembuatan akun klien **manual** dari Settings → Users: admin membuat baris
  `clients` + user (`role: client`) + kredential sekaligus, dengan password awal
  yang admin ketik (tidak butuh email).
- Pastikan alur login klien (`/login` → `/portal`) terverifikasi lewat e2e.
- Dokumentasi singkat di `DEPLOY.md`.

**Keluar (YAGNI):**
- Pendaftaran mandiri (self-signup) publik — bertentangan dengan `disableSignUp: true`
  di `lib/auth.ts` dan model keamanan (`DEPLOY.md`).
- Pengubahan role user menjadi `client` lewat `setUserRole` (tetap dilarang; lihat
  `users-logic.ts:134`).
- Pengaturan ulang password klien dari tabel Users (sudah dinonaktifkan untuk
  klien di `user-row-actions.tsx`; klien diundang ulang bila lupa).
- Halaman login terpisah untuk klien — `/login` bersama sudah cukup.

## 3. Desain

### Fitur 1 — Undang ke portal (klien yang sudah ada)

- Komponen baru `components/clients/invite-client-button.tsx` (`"use client"`),
  memanggil `inviteClientUser` lewat `useAction` dari `next-safe-action/hooks`.
- Ditempatkan di header halaman detail klien, sebelah `Edit` / `ArchiveClientButton`.
- State tombol:
  - Jika `client.userId` sudah diisi → tampilkan teks statis
    "Sudah punya akun portal" (bukan tombol), agar admin tahu tidak perlu mengundang lagi.
  - Jika `client.email` kosong → tombol dinonaktifkan dengan `title`
    "Tambahkan email klien dulu".
  - Jika `client.archivedAt` → tombol tidak ditampilkan (serupa `ArchiveClientButton`).
- `onSuccess`: toast "Undangan dikirim ke {email}".
- `onError`: tampilkan `error.serverError` (mis. "This client already has a portal
  account." atau "This client has no email on file to invite.").
- Catatan dev: saat `RESEND_API_KEY` kosong, `sendResetPassword` (`lib/auth.ts:42`)
  mencatat URL set-password ke log server, bukan mengirim email. Tidak perlu UI khusus;
  cukup pastikan pesan sukses tidak menjanjikan "email terkirim".

### Fitur 2 — Buat akun klien manual (Settings → Users)

- `users-logic.ts`: fungsi baru `createClientUser(input)` (admin-only lewat
  `adminActionClient` di `users.ts`). Ia **menciptakan baris `clients` beserta
  user terkait** agar tidak menjadi akun yatim:
  1. Validasi `email` (jika diisi) belum dipakai user lain — `select` dari `users`
     where `email`; lempar "Email ini sudah dipakai akun lain." bila ada.
  2. `insert` ke `clients` (`name`, `type` default `"individual"`, `email`,
     `phone?`, `address?`) → `clientId`.
  3. `insert` ke `users` (`role: "client"`, `name`, `email`) → `userId`.
  4. `update` `clients` set `userId`.
  5. `insert` ke `accounts` (`providerId: "credential"`, password di-hash pakai
     `hashPassword` dari `better-auth/crypto`) — pola sama persis dengan
     `createStaffUser`.
  6. `return { id: userId, clientId }`.
- `users-schemas.ts`: `createClientUserSchema` = `{ name, email (email valid &
  wajib), password (min 10), type?, phone?, address? }`. `email` wajib karena
  dipakai untuk login.
- `users.ts`: `createClientUserAction` = `adminActionClient.inputSchema(...)`
  → panggil `createClientUser`, lalu `revalidatePath("/dashboard/settings/users")`
  dan `revalidatePath("/dashboard/clients")` (klien baru muncul di tabel Klien).
- Komponen baru `components/users/create-client-dialog.tsx`, meniru
  `create-staff-dialog.tsx`: field Nama, Email, Password awal (min 10, ditampilkan
  agar bisa disalin), optional Telepon & Alamat. `onSuccess` reset + tutup dialog
  + toast "Akun klien dibuat".
- `app/dashboard/settings/users/page.tsx`: tambah tombol **"Tambah klien"**
  di sebelah `CreateStaffDialog` (masing-masing membuka dialognya sendiri).
  Komentar di `create-staff-dialog.tsx:106-108` yang melarang `client` di sana
  menjadi kadaluarsa — ganti keterangannya agar menunjuk ke `createClientUser`.

## 4. Arsitektur & berkas

**Baru:**
- `components/clients/invite-client-button.tsx`
- `components/users/create-client-dialog.tsx`
- `lib/actions/users-schemas.ts` → `createClientUserSchema`
- `lib/actions/users-logic.ts` → `createClientUser`
- `lib/actions/users.ts` → `createClientUserAction`
- `e2e/client-portal.spec.ts`

**Diubah:**
- `app/dashboard/clients/[id]/page.tsx` — pasang `InviteClientButton`.
- `app/dashboard/settings/users/page.tsx` — tombol "Tambah klien".
- `components/users/create-staff-dialog.tsx` — perbaiki komentar (hapus larangan
  `client` yang sudah tidak berlaku).
- `DEPLOY.md` — catatan akses portal klien.

**Tidak diubah:** `lib/auth.ts` (`disableSignUp` tetap `true`),
`login-form.tsx` (sudah redirect klien ke `/portal`), `auth-guards`.

## 5. Data flow

- **Undang:** admin klik → `inviteClientUser({clientId})` → buat `users` (client)
  + `clients.userId` + `requestPasswordReset` → email/URL set-password → klien
  buka `/set-password?token=…` → `resetPassword` → akun aktif → login di `/login`.
- **Manual:** admin isi dialog → `createClientUserAction` → `clients` + `users`
  + `accounts` (password awal) → klien langsung bisa login di `/login` dengan
  password tersebut.

## 6. Penanganan error & validasi

- `inviteClientUser`: sudah menolak klien tanpa email / sudah punya akun / tidak
  ditemukan (`lib/actions/invite-client-user.ts:28-36`). Tombol men-disable diri
  sesuai state agar error tersebut jarang sampai ke server.
- `createClientUser`: email wajib & unik (cek `users`); `password` min 10
  (sama dengan `minPasswordLength` di `lib/auth.ts`); `name` wajib.
- Semua action lewat `adminActionClient` → surveyor/klien ditolak sebelum logic
  berjalan.

## 7. Keamanan

- Tidak ada jalan baru untuk `disableSignUp` — kedua fitur butuh admin.
- `createClientUser` selalu menautkan `clients.userId` sehingga tidak ada akun
  klien yatim (menjaga invarian `users-logic.ts:24-27`).
- Password di-hash dengan `hashPassword` Better Auth, tidak pernah disimpan mentah.

## 8. Pengujian

**Unit (`lib/actions/users.test.ts`):**
- `createClientUser` menolak email duplikat.
- `createClientUser` membuat `clients` + `users(role:client)` + `accounts`, dan
  mengisi `clients.userId` (tautan benar, bukan yatim).
- Guard: `createClientUser` via user bukan admin → ditolak.

**E2E (`e2e/client-portal.spec.ts`, setup auth admin):**
- **Flow manual:** admin buka Settings → Users → "Tambah klien" → isi nama/email/
  password → simpan → logout → login sebagai klien tersebut di `/login` →
  assert URL `/portal`.
- **Flow undang:** admin buka detail klien (yang belum punya akun) → "Undang ke
  portal" → assert baris `users` role `client` tercipta & tertaut. Ambil token
  set-password dari tabel `verifications` (identifier = email klien); bila Better
  Auth menyimpannya ter-hash, fallback baca URL dari log server dev. Buka
  `/set-password?token=…` → isi password → login sebagai klien → assert `/portal`.
- Pastikan `login-form` masih mengalihkan klien ke `/portal` (sudah dipakai
  `e2e/payments.spec.ts`; cukup pastikan tidak regresi).

## 9. Dokumentasi

`DEPLOY.md`: tambah paragraf — "Klien mendapat akun portal lewat dua jalan:
(1) diundang dari halaman Klien ('Undang ke portal', mengirim email set-password),
atau (2) dibuat manual oleh admin di Settings → Users ('Tambah klien', password
awal ditentukan admin). Keduanya login di `/login` dan diarahkan ke `/portal`."

## 10. Risiko & catatan

- Set-password token di e2e: mekanisme pengambilan token (DB vs log server)
  dipilih saat implementasi; keduanya valid karena dev berjalan tanpa
  `RESEND_API_KEY`.
- `UsersTable` menonaktifkan "setel password" untuk klien — tetap demikian; klien
  diundang ulang bila lupa password. Di luar cakupan fitur ini.
