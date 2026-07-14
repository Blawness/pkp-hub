# Timeline Fase Proyek — progres yang bisa ditunjuk

Tanggal: 2026-07-14

## Masalah

Sebuah proyek survey punya satu status pipeline (`baru` → `dijadwalkan` → `data_diambil`
→ `diproses` → `selesai`) dan satu surveyor yang di-assign. Itu saja.

Akibatnya:

- **"Diproses" bisa berarti apa saja.** Proyek yang baru mulai olah data dan proyek yang
  tinggal cetak laporan sama-sama berstatus `diproses`. Status pipeline menjawab "sampai
  tahap mana", tidak pernah "sudah berapa jauh".
- **Satu proyek = satu surveyor.** Padahal pekerjaan lapangan dan pengolahan data sering
  dipegang orang berbeda. Sekarang yang kedua tidak punya akses ke proyeknya sama sekali —
  `assertProjectAccess` (`lib/auth-guards.ts:118`) cuma mengenal `assignedSurveyorId`.
- **Klien tetap bertanya "sampai mana progresnya".** Portal klien menampilkan status
  pipeline yang sama kaburnya, jadi pertanyaan itu tidak pernah berhenti.
- **Tidak ada target waktu per pekerjaan.** Proyek melar tanpa ada satu pun titik yang
  bisa ditunjuk sebagai yang telat.

Fase pekerjaan tiap proyek berbeda-beda (topografi tidak sama dengan luas bangunan), jadi
menambah nilai enum ke `projectStatus` bukan jawabannya — yang dibutuhkan adalah rincian
yang **dibuat per proyek**.

## Ruang lingkup

**Masuk:**

1. Fase dinamis per proyek: nama, urutan, status, bobot, penanggung jawab, target selesai,
   catatan internal.
2. Persen progres proyek yang **diturunkan** dari fase, bukan diketik.
3. Surveyor yang di-assign ke sebuah fase mendapat akses ke proyeknya.
4. Portal klien: timeline read-only + persen progres.

**Tidak masuk:**

- **Mengganti status pipeline.** Status tetap jadi ringkasan kasar: ia yang dipakai filter
  proyek, warna badge, notifikasi email Phase 11, dan dashboard. Fase adalah lapisan
  rincian **di dalam** status, bukan penggantinya. Merombaknya berarti menyentuh lima
  modul yang sudah jalan demi keuntungan konseptual saja.
- **Template fase per jenis survey.** Butuh modul CRUD template tersendiri. Tunggu sampai
  terbukti polanya memang berulang — kalau iya, template bisa ditambahkan di atas model
  ini tanpa mengubahnya.
- **Ketergantungan antar-fase** (fase 2 terkunci sampai fase 1 selesai). Aturan urutan
  yang dipaksakan sistem gampang jadi penghalang di lapangan, di mana pekerjaan memang
  sering tumpang tindih.
- **Email ke klien tiap fase selesai.** Notifikasi status (Phase 11) sudah ada; menambah
  email per fase berisiko membuat klien menganggap semua email dari sistem ini spam.
- **Fase sebagai unit penagihan** (termin bayar per fase). Ledger pembayaran Phase 12
  berdiri sendiri dan tidak akan ditautkan ke fase.

## Bagian 1 — Model data

### Tabel baru `project_phase`

```
id                  uuid pk
projectId           uuid  → project.id  (cascade)
name                text  notNull
description         text                 -- catatan internal; TIDAK PERNAH ke klien
sortOrder           integer notNull      -- posisi di timeline
status              project_phase_status notNull default 'belum'
weight              integer notNull default 1   -- bobot progres
assignedSurveyorId  text  → user.id (set null)
targetDate          date (mode string)   -- deadline; null = tanpa target
completedAt         timestamptz          -- diisi OTOMATIS, lihat di bawah
createdAt / updatedAt
index (projectId)
```

Enum baru `project_phase_status`: `belum` | `berjalan` | `selesai`.

`weight` default **1**. Artinya studio yang tidak peduli bobot tetap dapat persen progres
yang masuk akal (semua fase dianggap setara), tanpa satu pun isian tambahan. Bobot hanya
diutak-atik kalau memang ada fase yang jauh lebih berat dari yang lain.

`targetDate` memakai `date` mode **string** (`YYYY-MM-DD`), bukan `Date` — alasan yang
sama dengan `payment.paidAt` di Phase 12: ini tanggal kalender, dan `Date` di server
ber-offset negatif bisa menggesernya sehari.

### Dua nilai turunan, bukan kolom

Mengikuti pelajaran Phase 12 (`paymentStatus` berhenti jadi input manusia):

**Persen progres.** Dihitung, tidak disimpan:

```
progress = (Σ weight fase berstatus 'selesai') / (Σ weight semua fase) × 100
```

- Fase `berjalan` dihitung **0**. "Setengah selesai" adalah klaim, bukan fakta; kalau
  pekerjaannya perlu dibelah, belah fasenya.
- Proyek **tanpa fase** mengembalikan `null`, bukan `0`. Nol berarti "sudah punya rencana,
  belum dikerjakan"; `null` berarti "belum pakai timeline". UI tidak boleh menampilkan
  "0%" untuk proyek yang cuma belum memakai fitur ini.
- Total bobot 0 (semua fase diberi bobot 0) juga mengembalikan `null` — bukan lempar
  pembagian nol.

**`completedAt`.** Diisi oleh transisi status ke `selesai`, dan **dikosongkan** kalau
status dimundurkan dari `selesai`. Tidak ada input manual: tanggal selesai yang bisa
diketik akan berbeda dari status, dan salah satunya pasti bohong.

### Perubahan perilaku yang disengaja

**`assertProjectAccess` diperluas.** Sekarang surveyor lolos hanya kalau
`project.assignedSurveyorId === user.id`. Setelah ini ia juga lolos kalau ia di-assign ke
**salah satu fase** proyek tersebut. Tanpa ini, menugaskan surveyor ke sebuah fase tidak
memberinya apa pun — fiturnya jadi hiasan.

**`listProjectsForUser` diperluas dengan aturan yang sama.** Kalau hanya guard-nya yang
diperluas, proyek itu bisa dibuka lewat URL langsung tapi tidak muncul di daftar proyek
surveyor — yang artinya, dalam praktik, tidak bisa ditemukan. Dua tempat ini harus selalu
mengatakan hal yang sama; test mengunci keduanya bersamaan.

Ini satu-satunya perubahan pada perilaku yang sudah berjalan.

## Bagian 2 — Batas akses

| Aksi | Admin | Surveyor ber-akses | Klien |
|---|---|---|---|
| Lihat fase | ya | ya | ya (terbatas, lihat bawah) |
| Tambah / hapus / susun ulang fase | ya | tidak | tidak |
| Ubah nama, bobot, target, penanggung jawab | ya | tidak | tidak |
| Ubah status fase | ya | ya | tidak |
| Isi / ubah `description` | ya | ya | tidak |

"Surveyor ber-akses" = lolos `assertProjectAccess` (di-assign ke proyek **atau** ke salah
satu fasenya).

Pembagiannya: **admin memegang rencana, surveyor melaporkan pekerjaan.** Surveyor tidak
bisa mengacak susunan atau bobot fase — kalau bisa, persen progres berhenti berarti apa
pun karena orang yang dinilai olehnya juga yang menyusunnya.

**Yang dilihat klien** hanyalah: nama fase, status, `targetDate`, `completedAt`, dan
persen progres proyek. `description` (catatan internal) dan `weight` **tidak pernah
dikirim ke klien** — dipangkas di level query, bukan disembunyikan di UI, karena UI bukan
batas keamanan (pola yang sama dengan `projectValue`). Penanggung jawab fase juga tidak
ditampilkan: portal klien saat ini tidak menampilkan nama surveyor di mana pun, dan fitur
ini bukan tempat untuk diam-diam mengubah itu.

## Bagian 3 — Permukaan & alur

### Admin & surveyor — `/dashboard/projects/[id]`, tab baru "Fase"

- Progress bar + "3 dari 5 fase selesai (60%)" di atas.
- Timeline vertikal urut `sortOrder`. Tiap kartu fase: nama, penanggung jawab, target,
  status, catatan.
- Fase yang `targetDate` < hari ini **dan** status ≠ `selesai` ditandai **telat**.
- Admin: tombol tambah fase, edit, hapus, dan susun ulang (naik/turun). Susun ulang
  menulis ulang `sortOrder` seluruh fase proyek dalam satu transaksi — bukan menukar dua
  baris, supaya tidak ada urutan kembar kalau ada dua aksi bersamaan.
- Surveyor: hanya ubah status + catatan. Kontrol lain tidak dirender **dan** ditolak di
  server action.

Tab "Fase" muncul untuk semua peran dashboard. Proyek tanpa fase menampilkan empty state
— untuk admin dengan ajakan menambah fase pertama, untuk surveyor sekadar "belum ada
fase".

### Klien — `/portal/projects/[id]`

Timeline read-only yang sama, tanpa catatan internal, tanpa bobot, tanpa penanggung jawab.
Kalau proyek belum punya fase, bagian ini **tidak dirender sama sekali** — bukan
menampilkan timeline kosong yang terlihat seperti proyek yang tidak dikerjakan.

### Yang tidak berubah

Status pipeline, filter proyek, papan proyek, warna badge, notifikasi email status, dan
dashboard owner: semuanya tetap seperti sekarang.

## Bagian 4 — Testing

Mengikuti pola repo: logika murni di `*-logic.ts` diuji langsung, guard diuji terpisah.

**`phases-logic.test.ts` (murni, tanpa I/O):**

- `calculateProgress`: bobot campuran; semua fase selesai → 100; tanpa fase → `null`;
  total bobot 0 → `null`; fase `berjalan` dihitung 0, bukan setengah.
- `isPhaseLate`: target lewat + belum selesai → telat; target lewat + sudah selesai →
  tidak telat; tanpa target → tidak pernah telat.
- Transisi status mengisi `completedAt` saat → `selesai`, dan **mengosongkannya** saat
  mundur dari `selesai`.
- `reorderPhases` menghasilkan `sortOrder` rapat 0..n-1 tanpa kembar.

**Guard (`auth-guards.test.ts`, memperluas yang ada):**

- Surveyor yang di-assign **hanya ke sebuah fase** (bukan ke proyeknya) **bisa** membuka
  proyek itu — dan proyek itu **muncul** di `listProjectsForUser`-nya. Dua-duanya dalam
  test yang sama: kalau salah satu jalan sendirian, fiturnya patah tanpa ketahuan.
- Surveyor yang tidak di-assign ke proyek maupun fase apa pun tetap ditolak.
- Klien tidak pernah menerima `description` maupun `weight` dari query portal — dikunci
  pada bentuk hasil query, bukan pada render.

**Server action:**

- Surveyor mencoba menambah/menghapus/menyusun ulang fase → ditolak, walau ia punya akses
  ke proyeknya.
- Klien mencoba mengubah status fase → ditolak.

**E2E (Playwright):** admin membuat 3 fase → menandai 1 selesai → klien membuka portal dan
melihat progres 33% beserta nama fase, tanpa catatan internal.

## Berkas

**Baru:**
- `lib/actions/phases-logic.ts` + `phases-logic.test.ts` — logika murni.
- `lib/actions/phases.ts` + `phases-schemas.ts` + `phases.test.ts` — server action.
- `components/projects/phase-timeline.tsx` — timeline (dipakai dashboard & portal).
- `components/projects/phase-form.tsx` — tambah/edit fase (admin).
- Migrasi drizzle: enum `project_phase_status` + tabel `project_phase`.

**Diubah:**
- `lib/db/schema.ts` — tabel + relasi.
- `lib/auth-guards.ts` — `assertProjectAccess` & `listProjectsForUser` mengenal fase.
- `app/dashboard/projects/[id]/page.tsx` — tab "Fase".
- `app/portal/projects/[id]/page.tsx` — timeline read-only.
- `lib/db/seed.ts` — fase contoh di proyek demo.
- `tasks.md`, `PRD.md`.

## Keputusan terbuka

Tidak ada. Semua pertanyaan desain terjawab saat brainstorming.
