# Inventaris Alat — alat punya pemegang

Tanggal: 2026-07-14

## Masalah

Alat ukur adalah aset termahal studio survey — total station, GPS RTK, drone, waterpass —
dan sistem tidak tahu satu pun dari mereka ada. Siapa memegang apa, sejak kapan, untuk
proyek apa: semuanya hidup di WhatsApp dan ingatan.

Akibatnya:

- **Alat "hilang" padahal cuma tidak diketahui posisinya.** Tidak ada satu tempat pun yang
  bisa ditanya "total station yang satu lagi di mana".
- **Bentrok jadwal ketahuan di lapangan.** Dua proyek di hari yang sama, satu alat.
  Ketahuannya saat surveyor sudah sampai lokasi.
- **Tidak ada durasi pakai.** Tidak ada dasar untuk tahu alat mana yang jarang dipakai,
  atau berapa jam sebuah alat sudah bekerja sebelum servis.
- **Alat rusak tidak punya tempat.** Satu-satunya cara "menandai" alat rusak adalah tidak
  memakainya dan mengingatnya.

## Ruang lingkup

**Masuk:**

1. CRUD alat: satu baris = satu unit fisik, dengan kondisi & data pembelian.
2. Pinjam & kembalikan: status pemakaian terlacak, durasi terhitung.
3. Tiap sesi pakai menunjuk **satu proyek**.
4. Riwayat pemakaian per alat dan per proyek.

**Tidak masuk:**

- **Stok / barang habis pakai** (patok, baterai, cat). Melacak per kuantitas adalah model
  yang berbeda karakter: "siapa memegang unit yang mana" jadi tak terjawab, dan
  pinjam-kembali berubah jadi kurang-tambah stok. Modul ini untuk aset bernomor seri.
- **Jadwal kalibrasi.** Studio belum menjalankan kalibrasi terjadwal; menambah kolom yang
  tidak pernah diisi cuma menambah isian kosong.
- **Booking / reservasi alat untuk tanggal depan.** Ini modul pencatatan, bukan
  penjadwalan — sejalan dengan non-goal PRD §1.3 (penjadwalan surveyor ditunda).
- **Biaya alat per proyek** (durasi × tarif). Bisa dibangun di atas data ini nanti; jangan
  sekarang, karena tarifnya belum ada dan angkanya akan mengarang.
- **Portal klien.** Alat adalah urusan internal studio. Klien tidak melihat modul ini sama
  sekali.

## Bagian 1 — Model data

### Tabel baru `equipment`

```
id             uuid pk
name           text notNull          -- "Total Station Topcon GM-52"
category       equipment_category notNull
serialNumber   text                  -- nomor seri; boleh kosong untuk alat lawas
condition      equipment_condition notNull default 'tersedia'
purchaseDate   date (mode string)    -- ADMIN-ONLY
purchasePrice  bigint                -- ADMIN-ONLY, rupiah
notes          text
archivedAt     timestamptz           -- soft delete
createdAt / updatedAt
index (condition), index (archivedAt)
```

Enum `equipment_category`: `total_station` | `gps_rtk` | `drone` | `waterpass` |
`theodolite` | `lainnya`.
Enum `equipment_condition`: `tersedia` | `perawatan` | `rusak` | `pensiun`.

**Satu baris = satu unit fisik.** Dua total station sejenis adalah dua baris. Hanya dengan
begitu sistem bisa menjamin satu alat dipegang satu orang, dan riwayat pakai menempel ke
unit yang benar.

**Alat tidak pernah dihapus permanen, hanya diarsipkan** (`archivedAt`) — alasan yang sama
dengan `users.archivedAt` di skema sekarang: baris `equipment_usage` menunjuk ke sini lewat
FK, jadi menghapusnya berarti menghapus jejak siapa pernah memegang apa. Alat terarsip
tidak bisa dipinjam dan tidak muncul di daftar, tapi riwayatnya utuh.

`condition` **terpisah** dari status pinjam. Alat rusak bukan "sedang dipakai" dan bukan
"tersedia"; tanpa kolom ini, satu-satunya cara menandainya adalah menghapusnya.

### Tabel baru `equipment_usage`

```
id            uuid pk
equipmentId   uuid → equipment.id  (restrict — alat diarsip, bukan dihapus)
projectId     uuid → project.id    (cascade)
usedById      text → user.id (restrict)   -- yang MEMEGANG alat
startedAt     timestamptz notNull
endedAt       timestamptz                 -- NULL = sedang dipakai
note          text
recordedById  text → user.id (restrict)   -- yang MENGINPUT
createdAt
index (equipmentId), index (projectId)
UNIQUE (equipmentId) WHERE endedAt IS NULL     ← partial unique index
```

`usedById` dan `recordedById` sengaja dipisah: admin sering menginput dari kantor untuk
surveyor yang sedang di lapangan. Menggabungkannya berarti riwayat mencatat admin sebagai
pemegang alat yang tidak pernah ia sentuh.

### Dua nilai turunan, bukan kolom

**Durasi pakai** dihitung dari `endedAt − startedAt`, tidak disimpan. Kalau disimpan,
mengoreksi jam mulai yang salah ketik akan meninggalkan durasi lama yang sudah jadi bohong.
Sesi yang masih berjalan (`endedAt` null) durasinya dihitung sampai sekarang.

**Status "sedang dipakai"** adalah turunan dari adanya sesi terbuka, bukan dropdown
terpisah. Tidak ada cara menandai alat "tersedia" sementara sesinya masih menggantung —
pola yang sama dengan `paymentStatus` di Phase 12.

### Aturan yang dijaga database, bukan cuma kode

**Satu alat tidak boleh punya dua sesi aktif** — dikunci dengan *partial unique index* pada
`equipmentId` untuk baris `endedAt IS NULL`. Kalau hanya dicek di kode ("apakah ada sesi
terbuka?" lalu insert), dua surveyor yang menekan "Pakai" hampir bersamaan bisa dua-duanya
lolos pengecekan sebelum salah satunya menulis, dan alat tercatat di dua tangan. Constraint
inilah pertahanan sungguhannya; pengecekan di kode hanya untuk memberi pesan error yang
enak dibaca.

Aturan lain, dijaga di logic layer:

- Alat dengan `condition` selain `tersedia` **tidak bisa** dipinjam.
- Alat yang sudah diarsipkan tidak bisa dipinjam.
- `startedAt` boleh **mundur** (untuk yang lupa menekan tombol) tapi **tidak boleh di masa
  depan** — itu booking, dan booking bukan cakupan modul ini.
- `endedAt` harus setelah `startedAt`.
- Mengembalikan alat = mengisi `endedAt` pada sesi terbuka. Sesi yang sudah ditutup hanya
  bisa dikoreksi oleh admin.

## Bagian 2 — Batas akses

| Aksi | Admin | Surveyor | Klien |
|---|---|---|---|
| Lihat daftar alat + status pakai | ya | ya | **tidak** |
| Lihat `purchasePrice` / `purchaseDate` | ya | **tidak** | tidak |
| Tambah / edit / arsipkan alat | ya | tidak | tidak |
| Ubah `condition` | ya | tidak | tidak |
| Catat pemakaian (pinjam) | ya, proyek mana pun | hanya proyek yang di-assign | tidak |
| Pilih **siapa** yang memakai (`usedById`) | ya | tidak — selalu dirinya sendiri | tidak |
| Kembalikan alat | ya | ya (sesi miliknya) | tidak |
| Koreksi sesi yang sudah ditutup | ya | tidak | tidak |

**`purchasePrice` dan `purchaseDate` dipangkas dari hasil query untuk non-admin di level
query**, bukan disembunyikan di UI — UI bukan batas keamanan. Ini pola `projectValue` yang
sudah dipakai di `app/dashboard/projects/[id]/page.tsx`: baris yang sampai ke surveyor
secara harfiah tidak memuat kunci-kunci itu.

**Surveyor tidak bisa mencatat atas nama orang lain.** Kalau bisa, alat bisa tercatat di
tangan orang yang tidak tahu apa-apa, dan pertanggungjawabannya bubar. Admin bisa, karena
dialah yang menginput dari kantor untuk lapangan.

**Surveyor hanya bisa memilih proyek yang di-assign ke dia** — dipagari
`assertProjectAccess` yang sama dengan modul lain (termasuk perluasan lewat fase dari spec
timeline, kalau itu sudah mendarat).

**Klien tidak punya permukaan apa pun ke modul ini.** Tidak ada rute portal, dan query
inventaris tidak pernah dipanggil dari `/portal`.

## Bagian 3 — Permukaan & alur

### `/dashboard/equipment` — daftar alat

Tabel: nama, kategori, nomor seri, kondisi, **status pakai**. Baris yang sedang dipakai
menampilkan "Dipakai — Budi · Kavling Bu Rina · sejak 2 hari lalu". Filter: kondisi,
kategori, dan "sedang dipakai / tersedia".

Admin: tombol tambah alat, dan aksi edit/arsip per baris. Surveyor: read-only pada daftar,
tapi tetap punya tombol pinjam/kembalikan.

### `/dashboard/equipment/[id]` — detail alat

Identitas alat + kondisi + (admin) data pembelian. Di bawahnya riwayat sesi pakai lengkap:
proyek, pemakai, mulai, selesai, durasi, catatan. Sesi yang masih berjalan ada di paling
atas dengan durasi berjalan.

### Tab "Alat" di `/dashboard/projects/[id]`

Alat apa saja yang dipakai di proyek ini, sesi berjalan maupun yang sudah selesai, plus
tombol catat pemakaian. Surveyor lapangan tidak perlu pindah halaman untuk mencatat.

### Alur pinjam

1. Pilih alat (hanya yang `tersedia` dan tidak sedang dipakai yang bisa dipilih).
2. Pilih proyek (surveyor: hanya proyeknya sendiri).
3. Waktu mulai default **sekarang**, bisa dimundurkan.
4. Admin: pilih pemakai. Surveyor: pemakai = dirinya, tidak ada pilihan.

Kembalikan: satu tombol. `endedAt` = sekarang, bisa dikoreksi.

## Bagian 4 — Testing

**`equipment-logic.test.ts` (murni, tanpa I/O):**

- `usageDuration`: sesi tertutup → selisih; sesi berjalan → dihitung sampai `now` yang
  di-inject (bukan `Date.now()` langsung, supaya test tidak flaky).
- `canBorrow`: alat `perawatan` / `rusak` / `pensiun` / terarsip → **tidak bisa**, satu
  kasus per kondisi.
- `startedAt` di masa depan ditolak; `endedAt` ≤ `startedAt` ditolak.
- Status pakai diturunkan dari sesi terbuka, bukan dari kolom.

**Guard & server action:**

- Surveyor mencatat pemakaian untuk proyek yang **bukan** miliknya → ditolak.
- Surveyor mencoba mengisi `usedById` orang lain → server **memaksa** `usedById = user.id`,
  bukan sekadar tidak merendernya di form.
- Surveyor menerima baris alat **tanpa** kunci `purchasePrice`/`purchaseDate` — dikunci
  pada bentuk hasil query, bukan pada render.
- Surveyor mencoba tambah/edit/arsip alat atau mengubah `condition` → ditolak.

**Sesi ganda (kunci utama modul ini):**

- Meminjam alat yang sudah punya sesi terbuka → ditolak dengan pesan yang menyebut siapa
  pemegangnya.
- Test yang memaksa dua insert sesi terbuka untuk alat yang sama **langsung ke DB**
  (melewati logic layer) harus gagal karena constraint. Ini yang membuktikan pertahanannya
  ada di database, bukan cuma di kode — dan akan jeblok kalau partial unique index-nya
  dicabut.

**E2E (Playwright):** admin menambah alat → surveyor meminjam untuk proyeknya → alat
tampil "Dipakai" di daftar → surveyor mengembalikan → durasi muncul di riwayat.

## Berkas

**Baru:**
- `lib/actions/equipment-logic.ts` + `equipment-logic.test.ts` — logika murni.
- `lib/actions/equipment.ts` + `equipment-schemas.ts` + `equipment.test.ts` — server action.
- `app/dashboard/equipment/page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`.
- `components/equipment/equipment-table.tsx`, `equipment-form.tsx`, `usage-history.tsx`,
  `borrow-dialog.tsx`.
- Migrasi drizzle: enum `equipment_category` + `equipment_condition`, tabel `equipment` &
  `equipment_usage`, **partial unique index** pada sesi aktif.

**Diubah:**
- `lib/db/schema.ts` — dua tabel + relasi.
- `app/dashboard/projects/[id]/page.tsx` — tab "Alat".
- Navigasi dashboard — menu "Inventaris" (admin & surveyor, tidak untuk klien).
- `lib/db/seed.ts` — beberapa alat + sesi contoh.
- `tasks.md`, `PRD.md`.

## Keputusan terbuka

Tidak ada. Semua pertanyaan desain terjawab saat brainstorming.
