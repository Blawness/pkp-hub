# Inventaris — item dengan quantity, unit tetap punya kode unik

Tanggal: 2026-07-16

## Masalah

Model sekarang (`equipment`, spec 2026-07-14): satu baris = satu unit fisik, tanpa
pengelompokan. Kalau studio punya 5 GPS RTK sejenis, itu 5 baris terpisah yang cuma
kebetulan namanya sama persis — tidak ada satu tempat pun yang bisa dilihat "dari 5 GPS RTK
kami, berapa yang tersedia, berapa yang sedang dipinjam". Tiap unit juga tidak punya kode
inventaris yang enak dipakai lisan/tulisan di lapangan ("ambil GPS yang mana?") — cuma nama
alat (sama untuk semua unit sejenis) dan `serialNumber` opsional dari pabrik.

Tujuan fitur ini: admin bisa mendaftarkan alat sebagai **jenis** ("GPS RTK Trimble R8")
dengan beberapa **unit fisik** di bawahnya, tiap unit punya **kode unik** milik studio
sendiri (mis. `GPS-RTK-01`), dan daftar alat menunjukkan agregat tersedia/dipinjam per
jenis — tanpa kehilangan granularitas "siapa memegang unit yang mana" yang sudah jadi
invarian inti modul ini.

## Ruang lingkup

**Masuk:**

1. Tabel baru `equipmentItem` = jenis alat (nama, kategori, gambar).
2. `equipment` (existing, tidak di-rename) jadi murni **unit fisik** di bawah satu item:
   tambah `itemId` + `code` (kode inventaris, wajib & unik).
3. Daftar alat berubah dari flat unit → daftar item dengan accordion unit + agregat
   tersedia/dipinjam/perawatan/rusak per item.
4. Halaman detail per **unit** (bukan lagi per alat flat) — riwayat pakai penuh tetap di
   sini, tidak berubah dari sekarang.
5. Migrasi data: tiap `equipment` yang ada hari ini jadi satu `equipmentItem` beranggota 1
   unit (quantity 1) — tidak ada data yang hilang atau perlu diinput ulang manual.

**Tidak masuk (tetap non-goal dari spec 2026-07-14):**

- Stok/barang habis pakai (patok, baterai) — bukan model quantity generik tanpa identitas
  unit. Fitur ini menambah *pengelompokan* unit bernomor, bukan mengganti model per-unit
  jadi model stok.
- Booking/reservasi tanggal depan.
- Auto-generate kode unit massal (mis. isi quantity 5 → sistem bikin 5 kode sekaligus).
  Unit tetap ditambah **manual satu-satu**, tiap kali dengan kode yang diketik admin —
  dikonfirmasi saat brainstorming karena studio punya kode inventaris sendiri yang belum
  tentu ikut pola `PREFIX-NN`.
- "Quick borrow" satu klik dari daftar item tanpa memilih unit spesifik — pinjam tetap
  butuh memilih unit (dari accordion atau `BorrowDialog`), bukan auto-pick unit tersedia.
- Arsip di level item (mis. "matikan seluruh jenis alat sekaligus"). Arsip tetap per unit,
  sama seperti sekarang — item tanpa unit aktif otomatis menampilkan quantity 0.

## Bagian 1 — Model data

### Tabel baru `equipmentItem`

```
id          uuid pk
name        text notNull        -- "GPS RTK Trimble R8"
category    equipment_category notNull
image       text                -- URL objek storage, sama pola dengan equipment.image sekarang
createdAt / updatedAt
```

Tidak ada `archivedAt` di level item (lihat non-goal di atas) dan tidak ada
`purchaseDate`/`purchasePrice`/`serialNumber`/`condition`/`notes` — field-field itu
tetap di unit, karena tiap unit fisik bisa dibeli tanggal & harga berbeda, kondisinya
berbeda, dan catatannya spesifik ke unit itu ("layar retak sedikit").

### Tabel `equipment` (existing, sekarang murni unit fisik)

```
id             uuid pk
itemId         uuid → equipmentItem.id  (restrict)   -- BARU
code           text notNull unique                   -- BARU, kode inventaris studio
serialNumber   text                                    -- tetap, opsional, nomor seri pabrik
condition      equipment_condition notNull default 'tersedia'
purchaseDate   date (mode string)    -- ADMIN-ONLY, tetap
purchasePrice  bigint                -- ADMIN-ONLY, tetap
notes          text                  -- tetap
archivedAt     timestamptz           -- tetap, soft delete per unit
createdAt / updatedAt
```

Dihapus dari `equipment`: `name`, `category`, `image` — pindah ke `equipmentItem`, karena
field-field itu sama untuk semua unit sejenis.

`code` **beda tujuan** dari `serialNumber`: `code` dikontrol studio sendiri (bebas format,
wajib, unik — dipakai untuk saling merujuk di lapangan/laporan), `serialNumber` dari pabrik
(opsional, boleh kosong untuk alat lawas, tidak dijamin unik lintas merk). Dua alat beda
merk yang kebetulan serial-nya kosong/mirip tidak boleh membuat `serialNumber` gagal
sebagai identitas — makanya bukan `serialNumber` yang dijadikan wajib+unik.

`equipmentUsage` **tidak berubah sama sekali** — masih menunjuk `equipment.id` (unit),
partial unique index `equipment_active_usage_uniq` tetap menjaga satu unit tidak bisa
dipinjam dua sesi sekaligus, persis seperti sekarang.

### Migrasi (tiga tahap)

1. **Tambah struktur, nullable.** Migrasi drizzle: buat tabel `equipmentItem`; tambah kolom
   `equipment.item_id` (nullable dulu) dan `equipment.code` (nullable dulu, belum unique).
2. **Backfill data** (skrip migrasi data, bukan migrasi skema drizzle): untuk tiap baris
   `equipment` yang ada, insert satu `equipmentItem` dari `name`/`category`/`image`-nya,
   lalu set `equipment.item_id` ke id item baru itu. Isi `equipment.code`: pakai
   `serialNumber` yang ada kalau ada isinya & belum dipakai unit lain, kalau tidak
   generate `UNIT-<8 karakter pertama dari equipment.id>` — placeholder yang admin bisa
   ganti belakangan lewat form edit unit.
3. **Kunci constraint, buang kolom lama.** Migrasi drizzle lanjutan: `item_id` →
   `NOT NULL`; `code` → `NOT NULL UNIQUE`; drop `equipment.name`, `equipment.category`,
   `equipment.image`.

Tiga tahap ini perlu dijalankan berurutan (skema → backfill → kunci), bukan satu migrasi
drizzle generate sekali jalan, karena tahap 2 butuh logika (fallback kode) yang tidak bisa
diekspresikan sebagai diff skema.

## Bagian 2 — Batas akses

Tidak berubah dari spec 2026-07-14 — tabel akses lama tetap berlaku, dengan tambahan:

| Aksi | Admin | Surveyor | Klien |
|---|---|---|---|
| Tambah/edit jenis alat (`equipmentItem`) | ya | tidak | tidak |
| Tambah/edit/arsip unit di bawah suatu item | ya | tidak | tidak |
| Lihat daftar item + agregat tersedia/dipinjam | ya | ya | tidak |
| Pinjam/kembalikan unit | sama seperti sebelumnya (per unit, tidak berubah) | | |

`purchasePrice`/`purchaseDate` tetap dipangkas di level query untuk non-admin — sekarang
di `listUnitsForItem`/unit queries, pola yang sama seperti `listEquipmentForUser` sekarang.

## Bagian 3 — Logic layer

**File baru** `lib/actions/equipment-items-{schemas,logic,test}.ts` — pola 3-file domain,
sama seperti modul lain:
- `createEquipmentItemInputSchema` / `updateEquipmentItemInputSchema`: `name`, `category`,
  `image`.
- `createEquipmentItemForUser` / `updateEquipmentItemForUser` (admin-only).
- `listEquipmentItemsForUser(user)`: item + unit-unitnya + agregat count, sudah dipangkas
  kolom admin-only di level unit.
- `getEquipmentItemForUser(user, itemId)`: satu item + unit-unitnya (untuk render
  accordion-nya sendirian kalau dibutuhkan, mis. refresh parsial).

**`lib/equipment/derive.ts`** — tambah fungsi murni:

```ts
function summarizeUnits(
  units: { condition: EquipmentCondition; archivedAt: Date | null }[],
  activeUsageByUnitId: Set<string> | Map<...>,
): { total: number; tersedia: number; terpinjam: number; perawatan: number; rusak: number }
```

Testable tanpa DB, sama pola `borrowRejection`. Unit terarsip tidak dihitung di `total`.

**`lib/actions/equipment-logic.ts`** (unit, existing file) — perubahan:
- `createEquipmentForUser`/`updateEquipmentForUser`: input sekarang `itemId` + `code` (plus
  field unit yang sudah ada: `serialNumber`, `condition`, `purchaseDate`, `purchasePrice`,
  `notes`), bukan lagi `name`/`category`/`image`.
- `listEquipmentForUser` **diganti** oleh `listEquipmentItemsForUser` di file baru (dipakai
  halaman daftar). `getEquipmentForUser` **dipertahankan** tapi sekarang untuk halaman
  detail unit — join ke `equipmentItem` untuk ambil `name`/`category`/`image`-nya.
- `borrowEquipmentForUser`, `returnEquipmentForUser`, `correctUsageForUser`: **tidak
  berubah logikanya** — tetap beroperasi per `equipmentId` (unit).
- Query admin/safe columns (`adminColumns`/`safeColumns`) tambah join `equipmentItem` untuk
  `name`/`category`/`image`, drop dari `equipment` langsung.

## Bagian 4 — UI

### `/dashboard/equipment` — daftar item (accordion)

Server Component memanggil `listEquipmentItemsForUser`. Tiap baris item: gambar, nama,
kategori, badge ringkas "5 total · 3 tersedia · 2 dipinjam · 0 perawatan · 0 rusak"
(dihitung oleh `summarizeUnits`). Admin: tombol edit/arsip *tidak ada* di level item
(lihat non-goal); tombol yang ada adalah "+ Tambah item" (dialog `equipmentItem`) dan,
di dalam tiap item yang di-expand, "+ Tambah unit" (dialog scoped ke item itu, minta
`code`, `serialNumber`, `condition`, tanggal/harga beli, catatan).

Expand (client-side accordion state) menampilkan tabel unit milik item itu: kode, no.
seri, kondisi/status pakai, tombol **Pinjam**/**Kembalikan** langsung inline — reuse
`BorrowDialog`/`ReturnButton` yang sudah ada, tidak berubah triggernya (masih per
`equipmentId`).

`EquipmentSummary` (kartu ringkasan total di atas daftar) dihitung lintas **semua unit**
di semua item — sama persis cara hitungnya sekarang, cuma sumber datanya sekarang dari
`listEquipmentItemsForUser` (flatten semua unit di semua item) bukan `listEquipmentForUser`.

Filter kategori/status: sama seperti sekarang, tapi filter di level item — item tampil
kalau *ada* unit yang cocok filter (unit yang tidak cocok tetap tersembunyi di dalam
accordion-nya, bukan item-nya yang hilang seluruhnya).

### `/dashboard/equipment/unit/[unitId]` — detail unit (evolusi dari `[id]/page.tsx`)

Isinya sama seperti detail alat yang sekarang: identitas (sekarang: nama+kategori dari
item induk, kode+no.seri dari unit), kondisi, gambar (dari item induk), data pembelian
(admin), catatan, status pakai + tombol pinjam/kembalikan, riwayat pakai lengkap
(`UsageHistory`), edit/arsip unit. Link "kembali ke {nama item}" ke daftar dengan
accordion item itu ter-expand (query param, mis. `?expand={itemId}`).

### `ProjectEquipment` (tab "Alat" di detail proyek) & `BorrowDialog`

Opsi alat yang ditampilkan berubah label jadi `"${itemName} (${code})"` supaya kelihatan
unit mana yang dipilih saat ada beberapa unit sejenis. Tetap menunjuk `equipmentId` (unit)
— mekanisme pinjam/kembalikan proyek tidak berubah sama sekali.

## Bagian 5 — Testing

**`lib/equipment/derive.test.ts`** (tambahan):
- `summarizeUnits`: campuran kondisi + sesi aktif → agregat benar; unit terarsip tidak
  dihitung; item tanpa unit → semua nol.

**`lib/actions/equipment-items.test.ts`** (baru):
- Admin bisa create/update item; surveyor/klien ditolak.
- `listEquipmentItemsForUser` untuk surveyor tidak membawa `purchasePrice`/`purchaseDate`
  di unit-unitnya.

**`lib/actions/equipment.test.ts`** (update existing):
- Create/update unit sekarang butuh `itemId` valid + `code` unik — duplikat `code` ditolak
  (baik oleh guard di logic layer maupun oleh DB unique constraint, mis. test tulis
  langsung dua kode sama ke DB untuk membuktikan constraint-nya nyata — pola sama dengan
  test partial unique index sesi aktif di spec 2026-07-14).
- Borrow/return/correct: tidak ada test baru yang perlu diubah — perilakunya sama.

**E2E (`e2e/equipment.spec.ts`, update)**: admin bikin item → admin tambah 2 unit dengan
kode berbeda → daftar menunjukkan "2 total · 2 tersedia" → surveyor pinjam salah satu unit
→ badge jadi "1 tersedia · 1 dipinjam" → surveyor kembalikan → balik ke "2 tersedia".

## Berkas

**Baru:**
- `lib/actions/equipment-items-schemas.ts`, `equipment-items-logic.ts`,
  `equipment-items.test.ts`.
- `lib/actions/equipment-items.ts` (`"use server"` wrapper, pola `equipment.ts`).
- `components/equipment/equipment-item-form-dialog.tsx` (+ `equipment-item-form.tsx`).
- `components/equipment/equipment-item-accordion.tsx` (menggantikan
  `equipment-table.tsx`/`equipment-columns.tsx`/`equipment-card-list.tsx` sebagai tampilan
  utama daftar — file lama ini kemungkinan bisa disederhanakan/dilebur, ditentukan saat
  implementasi).
- `app/dashboard/equipment/unit/[unitId]/page.tsx` (pindahan dari `[id]/page.tsx`).
- Migrasi drizzle: tabel `equipmentItem`; kolom `equipment.item_id`+`equipment.code`
  (nullable → backfill script → `NOT NULL`/`UNIQUE`); drop `equipment.name`/`category`/
  `image`.

**Diubah:**
- `lib/db/schema.ts` — tabel `equipmentItem` + relasi; `equipment` kehilangan
  `name`/`category`/`image`, tambah `itemId`/`code`.
- `lib/actions/equipment-logic.ts`, `equipment-schemas.ts`, `equipment.ts`.
- `lib/equipment/derive.ts` — tambah `summarizeUnits`.
- `app/dashboard/equipment/page.tsx` — daftar item, bukan unit flat.
- `components/equipment/equipment-summary.tsx` — sumber data berubah, cara hitung sama.
- `components/equipment/project-equipment.tsx`, `components/equipment/borrow-dialog.tsx`
  (kalau ada) — label opsi alat jadi `"${itemName} (${code})"`.
- Hapus `app/dashboard/equipment/[id]/page.tsx` (diganti `unit/[unitId]/page.tsx`).
- `lib/db/seed.ts` — beberapa item dengan multi-unit sebagai contoh (bukan cuma quantity 1).
- `e2e/equipment.spec.ts`.

## Keputusan terbuka

Tidak ada — semua pertanyaan desain (level detail unit, alur input kode, penamaan tabel,
navigasi UI) terjawab saat brainstorming.
