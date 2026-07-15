# Desain: Gambar Alat (Inventaris)

Tanggal: 2026-07-15
Status: Disetujui untuk implementasi

## Tujuan

Tiap alat (equipment) bisa punya satu gambar. Thumbnail tampil di pojok kolom
"Nama" (kolom pertama) tabel inventaris, dan gambar lebih besar di halaman
detail alat. Gambar dioptimasi ke WebP di sisi klien sebelum di-upload supaya
render ringan dan bandwidth upload kecil.

## Konteks

- Modul equipment adalah **staff-only** (admin + surveyor). Klien tidak pernah
  mengaksesnya (`requireStaff()` di `app/dashboard/equipment/page.tsx`).
- Hanya **admin** yang bisa membuat/mengubah alat (`new/page.tsx`,
  `[id]/edit/page.tsx` memanggil `requireAdmin()`).
- Infrastruktur upload yang ada (`/api/documents/upload-init` +
  `/api/storage/[...key]`, `lib/storage`) sangat **terikat ke project**:
  `parseStorageKey` hanya mengenal kind `document` & `receipt` di bawah
  `<projectId>`. Equipment tidak terikat project, jadi butuh jalur key sendiri.
- Storage punya dua driver: `r2` (presigned URL) dan `local` (dev fallback via
  `/api/storage/[...key]`). Pemilihan otomatis lewat `selectStorageDriverName`.

## Keputusan

- **Satu gambar per alat** (bukan galeri).
- **Optimasi di client** (canvas → WebP), bukan server (tanpa dependency `sharp`).
- **Resize** maks sisi terpanjang **1024px** (jaga rasio), **quality 0.8**.
- **Ukuran maks** blob WebP hasil: **5MB**.
- Tampil di **tabel + detail**, dengan **placeholder** ikon bila belum ada gambar.
- Ganti gambar saat edit = **hapus objek lama** di storage.

## Rancangan

### 1. Data
- Tambah kolom `image: text("image")` (nullable) di tabel `equipment`
  (`lib/db/schema.ts`). Menyimpan URL objek (pola sama dengan
  `documents.fileUrl`).
- Migrasi Drizzle baru.

### 2. Optimasi (client, sebelum upload)
Di widget upload pada `equipment-form.tsx`:
1. Admin pilih file gambar.
2. Baca file → `createImageBitmap` (atau `<img>`) → gambar ke `<canvas>` dengan
   resize: hitung skala agar sisi terpanjang ≤ 1024px, jaga rasio aspek.
3. `canvas.toBlob(cb, "image/webp", 0.8)`.
4. Blob WebP inilah yang di-upload; nama file di-normalisasi ke `<uuid>.webp`.
5. Bila hasil > 5MB, tolak dengan pesan error lokal.

### 3. Storage & akses
- Key baru: `equipment/<uuid>.webp` (tidak terikat project — akses seragam).
- `lib/storage/keys.ts`: tambah kind `"equipment"`.
  - `StorageKeyKind` → `"document" | "receipt" | "equipment"`.
  - `ParsedStorageKey`: `projectId` menjadi opsional untuk kind equipment
    (equipment tidak punya projectId). Bentuk: `{ kind: "equipment" }`.
  - `parseStorageKey`: prefix `equipment` → `{ kind: "equipment" }` (tanpa
    memerlukan segmen kedua sebagai projectId).
- Route baru `POST /api/equipment/upload-init`:
  - `requireAdmin()`.
  - Validasi `contentType === "image/webp"` dan `fileSize ≤ 5MB`.
  - Buat key `equipment/<randomUUID>.webp`, `storage.getUploadUrl(key, contentType)`.
- `app/api/storage/[...key]/route.ts` (driver lokal saja):
  - GET untuk kind `equipment`: `requireStaff()` (tanpa `assertProjectAccess`).
  - PUT untuk kind `equipment`: `requireAdmin()` (tanpa `assertProjectAccess`).
  - Tetap tolak PUT untuk kind selain `document`/`equipment`.
- Untuk driver R2: tampilan gambar memakai presigned GET via `downloadUrlFor`,
  sama seperti dokumen.

### 4. Form (admin)
- `equipment-form.tsx`: tambah widget upload gambar.
  - Preview gambar saat ini (kalau editing dan ada `image`) atau hasil pilihan
    baru.
  - Tombol hapus (set image ke `null`).
  - Alur: pilih → konversi WebP (bagian 2) → panggil `/api/equipment/upload-init`
    → upload blob ke `target.url` (PUT) → simpan URL hasil ke field form `image`.
  - State loading saat konversi/upload; error lokal seperti pola form yang ada.
- `FormValues` + `EquipmentEditTarget` tambah `image: string | null`.

### 5. Tampilan
- Tabel (`equipment-columns.tsx`), kolom `name`: render thumbnail ~36px rounded
  di kiri teks nama (flex row). Tanpa gambar → placeholder ikon
  (mis. `ImageIcon`/`WrenchIcon`) dalam kotak berbingkai.
  - `EquipmentTableRow` tambah `image: string | null`.
  - `page.tsx` `rows.map` sertakan `image` (untuk R2, resolve ke display URL —
    lihat catatan URL di bawah).
- Detail (`app/dashboard/equipment/[id]/page.tsx`): tampilkan gambar lebih besar
  (mis. maks 256px), atau placeholder bila kosong.

### 6. Schema & action
- `equipment-schemas.ts`: tambah `image: z.string().nullish()` (URL) pada
  create & update.
- `equipment.ts` (`createEquipment`/`updateEquipment`): teruskan `image`.
- `equipment-logic.ts`: pada update, jika `image` berubah dan ada `image` lama,
  hapus objek lama (`storage.delete`/`del` sesuai API driver) — best-effort,
  jangan gagalkan operasi utama bila hapus gagal.

### Catatan URL tampilan
`equipment.image` menyimpan URL objek (`fileUrl`). Untuk menampilkannya:
- Driver lokal: URL sudah berupa `/api/storage/equipment/<uuid>.webp` (route
  GET yang menegakkan `requireStaff`).
- Driver R2: butuh presigned GET via `downloadUrlFor(fileUrl)` di server sebelum
  dikirim ke klien (di `page.tsx`/detail). Presigned berlaku 1 jam — cukup
  karena halaman di-render per request.

## Testing
- `lib/storage/keys.test.ts` (atau setara): `parseStorageKey` untuk kind
  `equipment` (dengan/ tanpa segmen kedua), dan tetap benar untuk
  `document`/`receipt`.
- Validasi schema: `image` menerima string & null/undefined.
- Logic action: `updateEquipment` menghapus objek lama saat gambar diganti;
  `createEquipment`/`updateEquipment` menyimpan `image`.

## Di luar cakupan (YAGNI)
- Galeri multi-gambar.
- Multi-ukuran/thumbnail terpisah di storage (satu WebP 1024px cukup).
- Konversi server-side (`sharp`).
- Akses gambar oleh klien (klien tidak melihat modul equipment).
