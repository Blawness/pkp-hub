# Perbaikan UX Inventaris Alat

Tanggal: 2026-07-15
Status: disetujui untuk implementasi

## Tujuan

Mempermudah alur inventaris untuk **dua** kelompok user yang sama pentingnya:
surveyor lapangan (HP) dan admin kantor (desktop). Prioritas utama:
**kemudahan user**. Tidak mengubah aturan bisnis / lapisan server
(`equipment-logic.ts`, guard, index unik) — hanya lapisan UI dan data yang
diteruskan ke UI.

## Ruang lingkup

Empat perbaikan, semua di sisi UI:

1. Pinjam alat langsung dari daftar & detail alat (bukan cuma dari proyek).
2. Ringkasan status di atas daftar alat, sekaligus quick-filter.
3. Konfirmasi sebelum mengembalikan alat.
4. Mobile-friendly (daftar alat → kartu di HP) + pencarian (combobox) di
   dialog pinjam.

Di luar ruang lingkup: mengubah skema, action, atau guard; koreksi jam
(`correctUsage`) tetap admin-only apa adanya; tabel riwayat di detail proyek
tetap scroll horizontal di HP (tidak diubah jadi kartu).

## Keputusan yang sudah diambil

- User utama: **surveyor (HP) + admin (desktop) seimbang** → mobile-first di
  daftar alat, tetap enak di desktop.
- Aksi di daftar alat desktop: **kolom "Aksi" dengan tombol** langsung
  (Pinjam / Kembalikan), bukan menu titik-tiga.
- Scope mobile: **daftar alat saja** jadi kartu; tabel proyek tidak diubah.

## Primitive baru (`components/ui/`)

Codebase belum punya keduanya, keduanya dibangun di atas `Dialog` yang ada
(bukan popup native — alasan dark-mode sama seperti `SelectField`).

### `combobox.tsx`
Single-select yang bisa dicari. Trigger = tombol menampilkan label terpilih;
klik membuka `Dialog` berisi `Input` pencarian + daftar opsi terfilter yang
bisa di-scroll. Bekerja identik di desktop & HP, popup digambar sendiri
(dark-mode aman).

Props: `options: {value,label}[]`, `value`, `onValueChange`, `placeholder`,
`searchPlaceholder`, `id`, `disabled`, `aria-label`.

### `confirm-dialog.tsx`
Dialog konfirmasi generik di atas `Dialog`. Mengelola `open`, `pending`, dan
`error` sendiri.

Props: `trigger` (ReactNode), `title`, `description`, `confirmLabel`,
`confirmVariant`, `onConfirm: () => Promise<{ error?: string } | void>`.
Menutup saat sukses; menampilkan `error` bila `onConfirm` mengembalikannya.

## A. Pinjam langsung dari alat

`BorrowDialog` di-refactor jadi dua mode via props (tepat satu "fixed" per
sumbu):

```
BorrowDialog({
  trigger?,                         // default: tombol "Pinjam alat"
  fixedProject?: { id, title },     // dari detail proyek
  fixedEquipment?: { id, name },    // dari daftar/detail alat
  projectOptions?: { id, title }[], // wajib bila tak ada fixedProject
  equipmentOptions?: { id, name }[],// wajib bila tak ada fixedEquipment (borrowable)
  isAdmin,
  surveyors,
})
```

- Sumbu yang tidak terkunci dirender pakai **`Combobox`** (alat / proyek).
  Pemilih surveyor (admin) juga pakai `Combobox`.
- Payload ke `borrowEquipment` tidak berubah (`equipmentId`, `projectId`,
  `startedAt`, `usedById?`, `note?`). Server tetap `assertProjectAccess` +
  memaksa `usedById` untuk surveyor.

Trigger baru:
- **Daftar alat** — kolom "Aksi": `Pinjam` bila `condition === "tersedia"` &&
  tidak ada `activeUsage`; `Kembalikan` bila ada `activeUsage` yang boleh
  ditutup user ini (`isAdmin || activeUsage.usedById === user.id`).
- **Detail alat** — di kartu "Status pakai": `Pinjam` (saat bebas) atau
  `Kembalikan` (saat dipakai & boleh).

Proyek yang bisa dipilih = `listProjectsForUser(user)` (surveyor otomatis
hanya proyeknya). Halaman memuat daftar ini + surveyor (admin) dan
meneruskannya ke tabel/detail.

## B. Ringkasan status + quick-filter

Komponen baru `components/equipment/equipment-summary.tsx` (server component).
Baris kartu: **Total · Tersedia · Terpinjam · Perawatan/Rusak**. Angka
**diturunkan** dari `items` yang sudah di-fetch di `page.tsx` — tidak ada
kolom/agregat tersimpan.

- Tersedia = `condition==="tersedia"` && tanpa `activeUsage`.
- Terpinjam = ada `activeUsage`.
- Perawatan/Rusak = `condition ∈ {perawatan, rusak}` && tanpa `activeUsage`.
- Total = seluruh alat non-arsip.

Tiap kartu adalah link yang meng-set `?status=` (nyambung ke filter yang sudah
ada di `page.tsx`); kartu yang cocok dengan filter aktif di-highlight. Pensiun
tidak diberi kartu (jarang), tetap bisa lewat dropdown filter.

## C. Konfirmasi kembalikan

`return-button.tsx` dibungkus `ConfirmDialog`. Menerima `equipmentName?` dan
`durationLabel?` opsional untuk teks konfirmasi ("Kembalikan {nama}? Sudah
berjalan {durasi}."). Dipakai di tiga tempat: tabel proyek, detail alat,
daftar alat. `onConfirm` memanggil `returnEquipment` dan mengembalikan
`{ error }` bila gagal (ditampilkan di dialog), atau `router.refresh()` saat
sukses.

## D. Mobile-friendly

- **`Combobox`** (bagian A) memberi pencarian di pemilih alat/proyek.
- **Daftar alat di HP**: `EquipmentFilters` dinaikkan agar selalu tampil (di
  `page.tsx`, di atas tabel), bukan lagi hanya sebagai toolbar di dalam
  `DataTable`. `EquipmentTable` merender:
  - `hidden md:block` → `DataTable` (tabel + pencarian teks bawaannya) seperti
    sekarang, plus kolom Aksi.
  - `md:hidden` → daftar **kartu**: gambar, nama (link), kategori, badge
    status gabungan, dan tombol Pinjam/Kembalikan.
  Kedua tampilan memakai baris data yang sama.

## Berkas yang tersentuh

Baru:
- `components/ui/combobox.tsx`
- `components/ui/confirm-dialog.tsx`
- `components/equipment/equipment-summary.tsx`
- `components/equipment/equipment-card-list.tsx` (kartu mobile)

Diubah:
- `components/equipment/borrow-dialog.tsx` (dua mode + combobox)
- `components/equipment/equipment-columns.tsx` (kolom Aksi)
- `components/equipment/equipment-table.tsx` (desktop table + mobile cards)
- `components/equipment/return-button.tsx` (konfirmasi)
- `components/equipment/project-equipment.tsx` (adaptasi props BorrowDialog)
- `app/dashboard/equipment/page.tsx` (summary, filter dinaikkan, muat
  projectOptions + surveyors)
- `app/dashboard/equipment/[id]/page.tsx` (aksi Pinjam/Kembalikan)

Tidak diubah: `lib/actions/equipment*.ts`, `lib/equipment/derive.ts`,
`lib/db/schema.ts`, guard.

## Pengujian

- Unit/logic tidak berubah → suite `equipment.test.ts` yang ada harus tetap
  hijau (regresi guard).
- Verifikasi manual end-to-end (skill `verify`) untuk alur baru:
  1. Admin: Pinjam dari daftar alat → pilih proyek → muncul di riwayat proyek.
  2. Surveyor: Pinjam dari detail alat → hanya proyeknya yang bisa dipilih.
  3. Kembalikan dari daftar → dialog konfirmasi → sesi tertutup.
  4. Kartu ringkasan meng-set filter yang benar.
  5. Tampilan kartu di viewport HP.
- `pnpm lint`, `pnpm typecheck` hijau.
