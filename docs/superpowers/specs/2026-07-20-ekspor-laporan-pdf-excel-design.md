# Ekspor laporan PDF & Excel — mesin generik, dipakai pertama oleh inventaris

Tanggal: 2026-07-20

## Masalah

Tidak ada satu pun layar di app ini yang bisa mengeluarkan datanya. Satu-satunya
dokumen yang bisa diunduh adalah kwitansi (`lib/receipts/`), dan itu dokumen
**satu-record** dengan tata letak khusus — bukan laporan tabular.

Kebutuhan langsungnya: admin/surveyor perlu membawa daftar inventaris ke luar
app — dicetak untuk stock opname, dilampirkan ke laporan, atau diolah di Excel.
Kebutuhan yang sudah terlihat di belakangnya: modul lain (klien, proyek,
pembayaran, dokumen) akan minta hal yang sama.

Karena itu fitur ini **bukan** "tombol ekspor di halaman inventaris". Ia adalah
mesin laporan generik, yang kebetulan konsumen pertamanya inventaris. Kalau
dibangun sebagai fitur inventaris dulu lalu "digeneralisasi nanti", yang terjadi
adalah tiap modul menyalin template dan menulis ulang koordinat layout-nya
sendiri — persis yang tidak diinginkan.

## Ruang lingkup

**Masuk:**

1. Mesin laporan murni di `lib/export/`: definisi kolom deklaratif → PDF
   (`pdf-lib`) dan XLSX (`exceljs`).
2. Registry laporan (`lib/export/reports/`) — tempat tiap modul mendeklarasikan
   laporannya.
3. Satu route handler `app/api/export/[report]/route.ts` yang melayani semua
   laporan.
4. Satu komponen `<ExportButton report="..." />` yang dipakai semua modul.
5. Laporan pertama: **inventaris alat**, dipasang di `app/dashboard/equipment/page.tsx`.

**Tidak masuk:**

- **Print view browser** (`@media print`). Dikonfirmasi saat brainstorming:
  yang dibutuhkan file yang bisa diarsipkan dan dikirim, bukan cetak langsung.
  Hasil cetak browser juga berbeda-beda dan membawa header/footer bawaan.
- **CSV.** XLSX asli sudah menutup kebutuhan olah-data. CSV di locale Indonesia
  justru sering salah parse (koma desimal, tanggal).
- **Laporan multi-tabel / multi-sheet.** Inventaris keluar sebagai satu tabel
  datar. Ringkasan per jenis ditolak di brainstorming — baris judul/subtotal
  merusak filter & pivot di Excel, yang justru alasan utama orang minta XLSX.
- **Escape hatch menggambar bebas** di renderer PDF (callback custom untuk blok
  tanda tangan dsb). Belum ada kebutuhannya; menambah permukaan API sekarang
  berarti merawatnya sebelum tahu bentuknya. Kwitansi tetap di `lib/receipts/`
  dengan layout bespoke-nya — ia dokumen satu-record, bukan laporan tabular, dan
  tidak dimigrasikan ke mesin ini.
- **Penjadwalan / kirim email laporan.**
- **Ekspor dari portal klien.** Mesinnya generik, tapi laporan pertama ini
  staff-only.

## Arsitektur

Tiga lapis dengan batas tegas:

```
lib/export/
  types.ts      ReportSpec, Column, ReportMeta
  format.ts     nilai sel → teks/angka (currency, date, number, text)
  layout.ts     helper murni: truncate, paginasi baris
  pdf.ts        buildReportPdf(spec, rows, meta)  → Uint8Array   [pdf-lib]
  xlsx.ts       buildReportXlsx(spec, rows, meta) → Uint8Array   [exceljs]

lib/export/reports/
  equipment.ts  deklarasi laporan inventaris
  registry.ts   { equipment: equipmentReport, ... }

app/api/export/[report]/route.ts    satu route untuk semua laporan
components/export/export-button.tsx satu tombol untuk semua laporan
```

`lib/export/` tidak menyentuh DB sama sekali — sama seperti `lib/receipts/` dan
`lib/equipment/derive.ts`, sehingga bisa diuji tanpa fixture apa pun.

Menambah ekspor di modul lain = satu file deklarasi + satu baris di registry +
pasang `<ExportButton report="clients" />`. Nol kode layout, nol route baru.

## Kontrak

```ts
type Column<Row> = {
  header: string
  get: (row: Row) => string | number | Date | null
  width: number                    // titik (PDF); dikonversi ke lebar kolom XLSX
  align?: "left" | "right"         // default kiri; angka sebaiknya kanan
  format?: "text" | "currency" | "number" | "date"  // default "text"
}

type ReportDefinition<Row> = {
  title: string                    // "Laporan Inventaris Alat"
  filename: string                 // "inventaris-alat" → inventaris-alat-2026-07-20.pdf
  columns: (user: SessionUser) => Column<Row>[]
  fetch: (user: SessionUser, params: URLSearchParams) => Promise<{
    rows: Row[]
    filterLabel: string | null     // "Kategori: GPS · Status: terpinjam"
    footnote: string | null        // "Total: 12 unit — 8 tersedia, 3 terpinjam, 1 perawatan"
  }>
}
```

`columns` menerima `user`, bukan array statis yang difilter belakangan. Kolom
harga beli tidak pernah **ada** di daftar kolom untuk surveyor. Ini mengikuti
aturan yang sudah berlaku di `listEquipmentItemsForUser`: harga dipangkas di
level query, bukan disembunyikan di render — supaya tidak bisa bocor karena satu
baris render yang lupa.

## Alur data

1. `<ExportButton>` adalah anchor ke
   `GET /api/export/equipment?format=pdf&<searchParams yang sedang aktif>`.
   Browser yang mengunduh — tanpa blob/objectURL di klien.
2. Route handler: `requireStaff()` → ambil definisi dari registry (404 kalau id
   tak dikenal) → `def.fetch(user, params)` → `def.columns(user)` → render →
   `Response(bytes)` dengan `Content-Disposition: attachment; filename=...`.

**Route handler, bukan server action.** Server action mengembalikan nilai JS;
untuk unduhan biner, GET route memberi nama file dan streaming yang benar tanpa
akal-akalan di klien.

**Klien tidak pernah mengirim baris data.** Ia hanya meneruskan `searchParams`
yang sedang aktif; server mengambil ulang lewat `listEquipmentItemsForUser`.
Kalau baris datang dari klien, siapa pun bisa mengarang isi laporan atau meminta
data di luar scope-nya — dan `requireStaff()` tidak akan menangkapnya, karena
surveyor memang berhak memanggil endpoint ini.

**`export-button.tsx` tidak boleh meng-import apa pun dari `lib/export/*`** —
hanya string id laporan. Kalau ia meng-import, `exceljs` dan `pdf-lib` ikut
tertarik ke bundle browser.

## Laporan inventaris

Satu baris per **unit fisik** (bukan per jenis), kolom jenis/kategori diulang —
bentuk yang langsung bisa difilter dan di-pivot di Excel.

| Kolom | Format | Catatan |
|---|---|---|
| Kode | text | kode inventaris unit |
| Jenis | text | nama `equipmentItem` |
| Kategori | text | lewat `equipmentCategoryLabel` |
| Kondisi | text | lewat `equipmentConditionLabel` |
| Status pakai | text | "Tersedia" atau "Andi · Proyek A" |
| Dipakai sejak | date | kosong kalau tidak terpinjam |
| Harga beli | currency | **admin saja** |

Filter aktif (kategori/status) ikut terpakai — ekspor = apa yang terlihat di
layar. Karena itu `filterLabel` **wajib** dicetak di kepala laporan: tanpa itu,
laporan parsial gampang disalahartikan penerimanya sebagai seluruh inventaris.

Ringkasan jumlah unit per kondisi masuk sebagai `footnote` satu baris di kaki
laporan, bukan sebagai tabel terpisah.

## Tata letak PDF

A4 landscape. Kop studio dari `lib/studio-identity.ts` (`STUDIO`), judul
laporan, `filterLabel`, dan tanggal cetak. Tabel dengan baris header berlatar,
lalu baris data. `footnote` di kaki tabel.

Baris header **diulang di tiap halaman**, dan tiap halaman punya nomor
"Hal 2/5" — laporan inventaris akan lebih dari satu halaman begitu unitnya
puluhan, dan halaman tanpa header tidak terbaca kalau lembarannya terpisah.

Lebar kolom dideklarasikan; teks yang melebihi dipotong dengan elipsis.

## Tata letak XLSX

Satu sheet. Baris 1 = header (tebal, freeze pane), baris berikutnya data.
Lebar kolom dari `Column.width`. `footnote` di baris terakhir setelah satu baris
kosong.

Sel bertipe benar: `currency`/`number` disimpan sebagai **angka** (dengan
`numFmt`, bukan string berformat), `date` sebagai date. Ini seluruh alasan orang
minta XLSX alih-alih CSV — kalau semua sel jadi teks, tidak ada yang bisa
dijumlahkan atau di-pivot.

## Kasus tepi

- **Nol baris** → file tetap terbentuk, berisi "Tidak ada data". User yang salah
  filter mendapat jawaban, bukan tombol yang tampak rusak.
- **Teks melebihi lebar kolom** (PDF) → dipotong + elipsis.
- **Baris melebihi satu halaman** (PDF) → halaman baru, header diulang.
- **Nilai null** → sel kosong, bukan "null" atau "-".
- **`report` id tak dikenal** → 404.
- **`format` selain `pdf`/`xlsx`** → 400.

## Testing

Mengikuti pola `lib/receipts/`: yang murni diuji langsung, tanpa DB.

- `format.test.ts` — currency, date, number, null.
- `layout.test.ts` — truncate (termasuk teks yang persis pas), paginasi.
- `xlsx.test.ts` — exceljs membaca balik workbook-nya sendiri: nilai sel benar,
  header di baris 1, dan **harga tersimpan sebagai angka, bukan string**.
- `pdf.test.ts` — byte diawali `%PDF`; jumlah halaman bertambah saat baris
  banyak (membuktikan paginasi jalan); tidak melempar saat `rows` kosong.
- `equipment.test.ts` — **surveyor tidak pernah mendapat kolom harga beli**;
  `filterLabel` dan `footnote` sesuai filter. Ikut pola test yang sudah ada
  untuk bagian yang menyentuh DB.

## Dependency

`exceljs` — server-only, tidak masuk bundle browser. `pdf-lib` sudah terpasang.

Sengaja **bukan `xlsx`/SheetJS**: paket itu sudah tidak dipublikasikan di npm
registry dan punya riwayat CVE.
