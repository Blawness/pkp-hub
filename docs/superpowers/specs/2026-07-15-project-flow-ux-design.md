# Perbaikan UX/UI Alur Proyek

**Tanggal:** 2026-07-15
**Status:** Disetujui — siap disusun rencana implementasi

## Masalah

Halaman detail proyek (`app/dashboard/projects/[id]/page.tsx`) terasa berat: 6
tab, dan informasi yang paling sering dicek ("proyek ini lagi di mana") tersebar
di dalam tab Overview yang isinya campur (detail proyek, daftar fase, assign
surveyor, ubah status). Ubah status memakai dropdown "pilih status baru" + tombol
yang abstrak — pengguna tidak bisa melihat posisi proyek dalam pipeline.

Insight pengguna: begitu membuka proyek, 80% niatnya **memantau posisi**
(status, progres fase, surveyor, sisa bayar), baru sesekali melakukan aksi.

## Tujuan

1. Info pantau langsung terlihat tanpa klik tab apa pun.
2. Ubah status jadi visual (pipeline) dengan aksi maju satu klik.
3. Murni bedah layout + interaksi. **Tidak menyentuh** server action, auth guard,
   transition table, atau isi tab Fase/Peta/Dokumen/Alat/Keuangan.

## Non-tujuan

- Tidak mengubah `getAllowedNextStatuses` / `FORWARD_CHAIN` / `changeProjectStatusForUser`.
- Tidak mengubah model data atau skema.
- Tidak menambah dependency UI baru — pakai komponen `components/ui/` yang ada
  (`dialog`, `dropdown-menu`, `badge`, `button`, `tooltip`); bar progres &
  disclosure dibuat dari elemen sederhana.
- Tidak mengubah halaman daftar proyek, form buat proyek baru, atau portal klien.

## Desain

### A. Panel Ringkasan — `components/projects/project-summary.tsx` (baru)

Komponen yang **menggantikan seluruh tab Overview**. Selalu tampil di atas
`Tabs`. Dirender oleh RSC `page.tsx`; sub-bagian interaktif adalah client
component. Isi dari atas ke bawah:

- **Baris judul**: `Judul · Klien (link ke /dashboard/clients/[id]) · Jenis
  survei`. Memindahkan header yang sekarang ada di `page.tsx:196-219` ke dalam
  panel. `StatusBadge` tetap dipakai di pipeline (bawah), bukan di baris ini.
  Tombol **Edit** (admin) tetap di pojok kanan panel.
- **Status pipeline** (komponen Bagian B).
- **Progres fase**: bar horizontal + teks `"<selesai> dari <total> fase selesai"`.
  Persen dari `getProjectProgress` (`number | null`; `null` = belum ada fase →
  tampilkan "Belum ada fase"). Hitungan `selesai`/`total` dihitung di RSC dari
  array `phases` yang sudah dibaca (`phases.filter(p => p.status === "selesai").length`).
- **Surveyor**: `"Surveyor: <nama>"`. Untuk admin, tombol edit kecil di sampingnya
  membuka `AssignSurveyorForm` yang sudah ada di dalam `Dialog` (modal) —
  menggantikan kartu "Assign surveyor" terpisah. Untuk non-admin: teks saja.
- **Sisa pembayaran** (admin saja — hanya saat `"projectValue" in project`):
  `"Sisa bayar: Rp<remaining>"` + `StatusBadge`/badge status lunas/sebagian/belum
  dari `paymentSummary.status`. Seluruh baris adalah link/anchor ke tab Keuangan
  (set nilai tab aktif). Jika `paymentSummary` null, sembunyikan baris.
- **Disclosure "Detail proyek"** (tertutup default, toggle `useState`): lokasi,
  tanggal order, deskripsi — memindahkan isi kartu "Detail proyek" sekarang
  (`page.tsx:232-256`).

### B. Status Pipeline — `components/projects/status-pipeline.tsx` (baru)

**Menggantikan** `components/projects/status-changer.tsx` (hapus file lama;
tidak ada pemakai lain — konfirmasi via grep saat implementasi). Memakai action
`changeProjectStatus` dan prop `allowedNextStatuses` yang sudah dihitung di
`page.tsx` — tidak ada logika transisi baru di client.

Props: `projectId`, `currentStatus`, `allowedNextStatuses: string[]`, `isAdmin: boolean`.

Perilaku:

- **Stepper horizontal**: `Baru → Dijadwalkan → Data Diambil → Diproses →
  Selesai` (urutan `FORWARD_CHAIN`, label dari `statusLabel`). Tahap sebelum
  posisi sekarang = terisi; tahap sekarang = disorot; tahap sesudah = pudar.
  Responsif: boleh scroll-x pada layar sempit (pola sama dengan `TabsList`).
- **Tombol utama** `"Lanjut ke: <tahap berikut> →"`: muncul jika ada langkah maju
  di `allowedNextStatuses` (yaitu elemen `FORWARD_CHAIN[idx+1]`). **Satu klik
  langsung eksekusi, tanpa konfirmasi** (reversibel lewat menu ⋯ mundur).
  Saat `isExecuting` → "Menyimpan…". Sukses → `router.refresh()`. Error →
  tampilkan `serverError`.
- **Menu "⋯"** (dropdown-menu, **admin saja**): berisi transisi non-maju dari
  `allowedNextStatuses` — Mundur satu tahap (`FORWARD_CHAIN[idx-1]`), Batalkan
  proyek (`dibatalkan`), Aktifkan lagi (`dibatalkan → baru`). Item destruktif
  (**Batalkan**, **Aktifkan lagi**) membuka `Dialog` konfirmasi ("Yakin batalkan
  proyek ini?") sebelum eksekusi. Mundur satu tahap: langsung, tanpa konfirmasi.
- **Toggle "Riwayat"**: tombol kecil yang meng-collapse/expand `StatusHistory`
  yang sudah ada (`useState`), agar riwayat tidak selalu memakan tempat.
- **Kasus ujung**:
  - `selesai`: tidak ada langkah maju → ganti tombol utama dengan badge
    "Selesai ✓". Admin masih bisa reopen/cancel via ⋯.
  - `dibatalkan`: stepper ditampilkan redup + badge "Dibatalkan"; ⋯ admin berisi
    "Aktifkan lagi".
  - Surveyor tanpa transisi apa pun (`allowedNextStatuses` kosong, `isAdmin`
    false): tidak ada tombol maupun ⋯ — tampilkan teks "Tidak ada transisi
    status yang tersedia untuk peran Anda saat ini." (pertahankan pesan lama).

### C. Perubahan `app/dashboard/projects/[id]/page.tsx`

- Hapus header lama (`196-219`) — dipindah ke `ProjectSummary`.
- Render `<ProjectSummary ... />` di atas `<Tabs>`.
- Hapus `<TabsTrigger value="overview">` dan seluruh `<TabsContent value="overview">`.
- `Tabs defaultValue` jadi `"fase"`. Tab tersisa: **Fase, Peta, Dokumen, Alat,
  Keuangan** (Keuangan tetap admin-only via `"projectValue" in project`).
- Sisipkan nilai yang dibutuhkan panel ke `ProjectSummary`: `project`, `client`,
  `assignedSurveyorName`, `surveyorRows` (untuk assign), `progress`, hitungan
  fase selesai/total, `paymentSummary` (admin), `statusLogs`+`nameById` (riwayat),
  `allowedNextStatuses`, `isAdmin`, `canChangeStatus`.
- Semua pembacaan DB yang sudah ada tetap; tidak ada query baru. `AssignSurveyorForm`,
  `StatusHistory`, `StatusBadge`, `PaymentForm` dipertahankan (dipakai ulang di
  panel / tab Keuangan).

## Komponen & antarmuka

| Unit | Jenis | Tanggung jawab | Bergantung pada |
|---|---|---|---|
| `project-summary.tsx` | RSC + island | Menyusun panel ringkasan; menaruh info pantau | `status-pipeline`, `AssignSurveyorForm`, `StatusHistory`, `StatusBadge`, `Dialog` |
| `status-pipeline.tsx` | client | Stepper visual + aksi maju/mundur/batal + riwayat | `changeProjectStatus`, `dropdown-menu`, `Dialog`, `StatusHistory`, `statusLabel` |
| `page.tsx` | RSC | Hapus Overview, render panel + 5 tab | keduanya di atas |

## Penanganan error

- Kegagalan `changeProjectStatus` → tampilkan `serverError` inline di dekat kontrol
  status (pola sama seperti `status-changer.tsx` lama). Tidak menutup dialog
  konfirmasi jika error.
- `progress === null` atau `phases` kosong → "Belum ada fase.", tanpa bar.
- Klien tidak ditemukan → tetap "Klien tidak ditemukan" (pola lama).

## Pengujian

- **Unit/logic**: tidak ada logika baru di server → tidak ada test server baru.
  Pastikan test `projects`/`project-detail` yang ada tetap hijau (tak ada
  perubahan kontrak).
- **Komponen** (jika ada infra test komponen; jika tidak, andalkan e2e):
  render `status-pipeline` dengan berbagai `currentStatus`/`allowedNextStatuses`/
  `isAdmin` → verifikasi tombol "Lanjut", isi menu ⋯, kasus selesai/dibatalkan,
  surveyor tanpa transisi.
- **E2e**: perbarui/tambah alur di `e2e/` yang membuka detail proyek dan mengubah
  status — sesuaikan selector yang dulu menunjuk dropdown status ke tombol
  "Lanjut" / menu ⋯. Verifikasi Overview sudah hilang dan panel ringkasan tampil.
- Wajib lolos: `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Risiko

- **E2e/selektor** yang bergantung pada dropdown status lama akan pecah — bagian
  dari pekerjaan, bukan kejutan.
- **Referensi `status-changer.tsx`** lain: grep sebelum menghapus.
