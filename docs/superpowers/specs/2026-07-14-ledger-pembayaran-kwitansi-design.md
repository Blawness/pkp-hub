# Ledger Pembayaran & Kwitansi — uang punya jejak

Tanggal: 2026-07-14

## Masalah

Modul Keuangan Ringan (PRD §3 Feature 5) menyimpan tiga hal di baris `project`:
`projectValue`, `paymentStatus` (`belum` / `sebagian` / `lunas`), dan `paymentNotes`
(teks bebas). Itu saja.

Akibatnya:

- **`sebagian` tidak menyimpan berapa.** Sistem tahu klien sudah bayar sebagian, tapi
  tidak tahu Rp berapa — jadi tidak tahu sisa tagihannya. Owner tetap harus mengingat
  atau membuka mutasi bank.
- **Status diketik manusia.** `paymentStatus` adalah dropdown. Tidak ada apa pun yang
  menghubungkannya dengan uang yang benar-benar masuk; ia bisa berbohong dan tidak ada
  yang tahu.
- **Tidak ada bukti bayar.** Klien membayar, lalu meminta kwitansi lewat WhatsApp, dan
  kwitansi itu dibuat manual di luar sistem.
- **"Total belum terbayar" di dashboard owner kasar.** Ia menjumlahkan `projectValue`
  **penuh** untuk setiap proyek berstatus `belum` **atau `sebagian`** — jadi proyek yang
  DP-nya sudah masuk 80% tetap dihitung sebagai piutang penuh. Angkanya selalu lebih besar
  dari kenyataan.

PKP menerima pembayaran dengan **termin bebas**: bisa lunas sekali, bisa dicicil 3–4 kali,
jumlah dan jadwalnya dinegosiasikan per klien. Model data sekarang tidak bisa merekam itu.

## Ruang lingkup

**Masuk:**

1. Ledger pembayaran: N baris pembayaran per proyek (tanggal, jumlah, metode, catatan).
2. `paymentStatus` berhenti jadi input manusia — diturunkan dari uang yang masuk.
3. Kwitansi PDF ber-nomor per pembayaran, disimpan permanen di R2.
4. Portal klien: riwayat pembayaran, sisa tagihan, unduh kwitansi sendiri.
5. Dashboard owner: piutang yang **eksak** (nilai proyek − yang sudah terbayar).

**Tidak masuk:**

- **Invoice / tagihan.** Kwitansi ≠ invoice. Kwitansi = bukti uang **sudah** diterima.
  Menagih (invoice bernomor, jatuh tempo, pengingat email) adalah fitur lain dengan siklus
  hidupnya sendiri. Ia berdiri di atas ledger ini; kerjakan setelah ini, bukan bersamanya.
- **Payment gateway / bayar online.** Tetap non-goal PRD §1.3.
- **Akuntansi penuh** (jurnal, pajak, laba-rugi). Tetap non-goal PRD §1.3.
- **Halaman pengaturan identitas studio.** Ini tool satu studio (non-goal PRD §1.3:
  multi-tenant). Identitas kop kwitansi jadi konstanta di kode.
- **Backfill data lama.** Prod masih seed/demo — tidak ada angka pembayaran sungguhan
  yang perlu diselamatkan. Yang diperbarui cuma `lib/db/seed.ts`.

---

## Bagian 1 — Model data

### Tabel baru `payment`

Append-only. Tidak ada `UPDATE` pada kolom angka: baris hanya **lahir** atau **dibatalkan**.

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | `uuid` PK | |
| `projectId` | `uuid` → `project` (`onDelete: cascade`) | |
| `amount` | `bigint` | Rupiah. Wajib > 0. |
| `paidAt` | `date` | Tanggal **uang diterima**, bukan tanggal input. |
| `method` | enum `payment_method` | `transfer` · `tunai` · `lainnya` |
| `note` | `text` nullable | mis. "DP 50% via BCA" |
| `receiptNumber` | `text` **unique, not null** | Lihat Bagian 2. |
| `receiptFileUrl` | `text` nullable | Kunci objek R2. Null hanya kalau generate PDF gagal. |
| `recordedById` | `text` → `user` (`onDelete: restrict`) | Siapa yang mencatat. |
| `voidedAt` | `timestamptz` nullable | Non-null = dibatalkan. |
| `voidedReason` | `text` nullable | Wajib diisi kalau membatalkan. |
| `voidedById` | `text` → `user` nullable | |
| `createdAt` | `timestamptz` default now | |

Index: `payment_project_id_idx` pada `projectId`.

`onDelete: restrict` pada `recordedById` konsisten dengan `documents.uploadedById` — user
di-soft-delete, barisnya tidak pernah hilang, jadi FK tidak pernah menggantung.

### Derivasi status

`projects.paymentStatus` **tetap ada sebagai kolom**. Ia bukan duplikasi yang malas: filter
proyek (`/dashboard/projects`) dan ringkasan dashboard sudah memakainya tanpa join, dan
membuangnya berarti setiap daftar proyek harus meng-agregasi tabel `payment`. Yang berubah:
kolom itu berhenti diisi manusia, dan **selalu** dihitung ulang di dalam transaksi yang sama
dengan perubahan yang memicunya.

```
terbayar = Σ payment.amount WHERE projectId = ? AND voidedAt IS NULL

terbayar == 0             → belum
terbayar <  projectValue  → sebagian
terbayar >= projectValue  → lunas
```

Lebih bayar (`terbayar > projectValue`) tetap `lunas`; UI memberi badge "Lebih bayar
Rp…" supaya kekeliruan kelihatan alih-alih tersembunyi.

Fungsi derivasinya **murni** — `derivePaymentStatus(terbayar: number, nilai: number)` —
tanpa I/O, diuji langsung.

Tiga titik yang memicu hitung ulang, ketiganya di dalam transaksi:

1. `recordPayment` (insert baris baru)
2. `voidPayment` (tandai `voidedAt`)
3. `updatePayment` (owner mengubah `projectValue` — nilai turun bisa membuat proyek jadi
   `lunas`, nilai naik bisa membuatnya kembali `sebagian`)

### Perubahan perilaku yang disengaja

- **Dropdown status bayar hilang** dari `components/projects/payment-form.tsx`.
  `updatePaymentInputSchema` kehilangan field `paymentStatus`; action-nya menyusut jadi
  "atur nilai proyek + catatan". Owner tidak bisa lagi menandai proyek lunas tanpa
  mencatat uangnya — itu **intinya**, bukan efek sampingnya.
- **Pembayaran hanya boleh dicatat kalau `projectValue` terisi dan > 0.** Tanpa nilai
  proyek, "sisa tagihan" dan "lunas" tidak punya arti. Server menolak; UI mengarahkan owner
  mengisi nilai proyek dulu.
- **Piutang dashboard jadi eksak:** `Σ (projectValue − terbayar)` untuk proyek non-`dibatalkan`
  yang belum lunas. Aturan lama (`dibatalkan` dikecualikan) tetap berlaku dan tetap diuji.

---

## Bagian 2 — Kwitansi

### Nomor

Format: `KW/PKP/{tahun paidAt}/{urut 4 digit}` → `KW/PKP/2026/0007`.

Urutannya dari **Postgres sequence** (`receipt_number_seq`), bukan `SELECT max(...) + 1`:
sequence tidak bisa memberi angka yang sama ke dua transaksi, `max()+1` bisa. Counter
**tidak di-reset per tahun** (tahun cuma dicetak dari `paidAt`) — reset tahunan menambah
state yang harus dijaga dan tidak membeli apa pun; nomornya tetap unik dan tetap urut.
`receiptNumber` juga `UNIQUE` di DB sebagai jaring pengaman.

Nomor **dialokasikan saat baris pembayaran dibuat** dan tidak pernah dipakai ulang. Pembayaran
yang dibatalkan **membakar** nomornya (nomor itu hilang dari urutan) — itu benar: nomor
kwitansi yang sudah pernah terbit tidak boleh muncul lagi dengan angka berbeda.

### Isi

Kwitansi Indonesia yang layak:

```
[logo]  PT PRESISI KONSULINDO PRIMA
        {alamat}  ·  {telepon}  ·  {email}
────────────────────────────────────────────
                K W I T A N S I
                No. KW/PKP/2026/0007

Telah terima dari : {client.name}
Uang sejumlah     : Rp7.500.000
Terbilang         : ## Tujuh Juta Lima Ratus Ribu Rupiah ##
Untuk pembayaran  : {project.name} ({surveyTypeLabel})
                    {note, kalau ada}
Metode            : Transfer
────────────────────────────────────────────
Nilai proyek : Rp15.000.000
Total dibayar: Rp7.500.000
Sisa         : Rp7.500.000
                            {kota}, 14 Juli 2026
                            Penerima,


                            {nama penanda tangan}
                            {jabatan}
```

**Terbilang** (angka → kata Bahasa Indonesia) adalah fungsi murni baru,
`lib/terbilang.ts`, tanpa dependency. Ia punya kasus-kasus yang gampang salah — "sebelas",
"seratus", "seribu" (bukan "satu ribu") — jadi ia diuji langsung dengan tabel kasus.

**Identitas studio** = konstanta di `lib/studio-identity.ts` (nama, alamat, telepon, email,
kota, penanda tangan, jabatan, path logo). Menggantinya = satu commit.

### Generasi & penyimpanan

- Library: **`pdf-lib`**. Alasan: jalan mulus di runtime Node tanpa konfigurasi bundler,
  dan menghasilkan `Uint8Array` dari fungsi murni — jadi template kwitansi bisa diuji
  tanpa browser dan tanpa snapshot. Harganya: tata letak ditulis manual (koordinat), bukan
  JSX. Untuk **satu** template, itu harga yang murah; `@react-pdf/renderer` menyeret
  reconciler React ke dalam bundel server demi kenyamanan yang tidak kita butuhkan.
- Kunci objek: `receipts/{projectId}/{receiptNumber dengan "/" → "-"}.pdf`
  → `receipts/<uuid>/KW-PKP-2026-0007.pdf`.
- Ditulis lewat `storage.put(key, buffer, "application/pdf")` — driver yang sama dengan
  dokumen, jadi fallback disk lokal di dev ikut jalan gratis.
- Diunduh lewat `downloadUrlFor(fileUrl)` (presigned, 1 jam). **Tidak pernah** menyerahkan
  `receiptFileUrl` mentah ke browser — bucket R2 privat.

### Kegagalan generate PDF tidak boleh membatalkan pembayaran

Uang yang sudah masuk adalah fakta; PDF hanyalah cerminannya. Kalau R2 sedang down,
pembayaran tetap harus tercatat. Jadi: baris pembayaran di-commit dulu (transaksi), lalu
PDF di-generate **di luar transaksi**, error-nya ditelan + di-log, `receiptFileUrl` tetap
null. UI menampilkan tombol "Buat ulang kwitansi" untuk baris ber-`receiptFileUrl` null.

Ini pola yang sama dengan notifikasi email Phase 11 (`changeProjectStatusForUser`), dan
alasannya sama: **pekerjaan sampingan tidak boleh mengalahkan pekerjaan sungguhan.**

### Pembatalan

Baris ditandai `voidedAt` / `voidedReason` / `voidedById` dan berhenti dihitung.
PDF di kunci R2 yang sama **ditimpa** dengan versi yang sama persis + cap besar
**DIBATALKAN** melintang dan alasannya. Jadi kwitansi yang sama, kalau diunduh lagi hari
ini, jujur mengatakan dirinya batal. (Salinan yang terlanjur diunduh klien tentu tidak bisa
ditarik — itulah kenapa ledger-nya append-only dan koreksi selalu menerbitkan nomor baru.)

---

## Bagian 3 — Batas akses

Ini bagian yang paling gampang bocor, jadi ia eksplisit.

| Peran | Boleh |
|---|---|
| **admin** | Lihat, catat, batalkan pembayaran. Unduh semua kwitansi. Lihat piutang. |
| **client** | Lihat pembayaran **proyeknya sendiri** (read-only) + unduh kwitansinya. |
| **surveyor** | **Tidak ada apa pun.** Tidak ada daftar, tidak ada angka, tidak ada kwitansi. |

Aturan surveyor bukan kosmetik. Jaminan yang sudah ada — `projectValue` / `paymentStatus` /
`paymentNotes` **di-omit server-side** dari payload surveyor (`dashboard-logic.ts`, dengan
regression test) — akan runtuh kalau kwitansi bisa dia buka, karena kwitansi memuat nilai
proyek di badannya.

**Karena itu kwitansi TIDAK disimpan sebagai baris `documents`.** Modul Arsip terlihat oleh
surveyor untuk proyek yang di-assign ke dia. Kalau kwitansi hidup di sana, setiap query
dokumen (tab arsip proyek, pencarian lintas proyek, hitungan, preview, unduhan presigned)
harus ingat mengecualikannya — dan satu jalur yang lupa berarti nilai proyek bocor. Kwitansi
hidup di kolom `payment.receiptFileUrl`, di balik guard keuangan yang sudah terbukti.
Permukaan bocornya nol, bukan "kecil".

**Rute storage lokal harus ikut tahu.** `app/api/storage/[...key]/route.ts` sekarang
menurunkan `projectId` dari kunci ber-prefix `documents/` dan menegakkan aturan
`sharedWithClient` untuk klien. Ia harus mengenali prefix `receipts/` juga, dengan aturan
berbeda: **admin boleh; klien boleh kalau proyek itu miliknya; surveyor DITOLAK** — meski
proyek itu di-assign ke dia. Tanpa ini, dev dengan driver lokal punya lubang yang tidak ada
di prod, dan lubang itu akan menyeberang ke prod pada perubahan berikutnya.

Semua logika di `lib/actions/payments-logic.ts` yang menyentuh satu proyek **wajib** lewat
`assertProjectAccess` — pola yang sama dengan `finance-logic.ts`, dan alasannya sama.

---

## Bagian 4 — Permukaan & alur

### Owner — `/dashboard/projects/[id]`

Panel **Pembayaran** baru di bawah panel Keuangan yang sudah ada (keduanya hanya dirender
untuk admin — sudah begitu hari ini):

- Ringkasan: `Nilai proyek` · `Terbayar` · `Sisa` + badge status turunan.
- Tabel pembayaran: tanggal · jumlah · metode · catatan · nomor kwitansi · aksi.
  Baris batal ditampilkan dengan coretan + alasan (jejaknya utuh, tidak disembunyikan).
- Tombol **Catat pembayaran** → dialog (RHF + zod): jumlah, tanggal, metode, catatan.
  Dinonaktifkan dengan penjelasan kalau `projectValue` belum diisi.
- Per baris: **Unduh kwitansi** (atau "Buat ulang" kalau `receiptFileUrl` null) dan
  **Batalkan** (dialog konfirmasi + alasan wajib).

### Klien — `/portal/projects/[id]`

Bagian **Pembayaran** read-only: nilai proyek, terbayar, sisa, dan daftar pembayaran
(tanggal, jumlah, metode, nomor kwitansi, tombol unduh). Baris batal **tidak ditampilkan**
ke klien — mereka bukan bagian dari catatan uangnya, dan menampilkan "dibatalkan" tanpa
konteks cuma memancing pertanyaan yang tidak perlu.

### Surveyor

Tidak ada perubahan. Tidak ada panel, tidak ada field baru di payload-nya.

### Dashboard owner — `/dashboard`

`totalUnpaid` berhenti memakai `projectValue` penuh dan jadi `Σ (projectValue − terbayar)`.
Angkanya turun ke nilai yang benar.

---

## Bagian 5 — Testing

Nilai tiap test: apa yang gagal kalau kodenya salah.

**Murni (tanpa DB):**

- `derivePaymentStatus` — 0 → `belum`; kurang → `sebagian`; pas → `lunas`; lebih → `lunas`.
- `terbilang` — tabel kasus: 0, 1, 11, 15, 100, 101, 1_000, 1_500, 7_500_000,
  15_000_000, 1_000_000_000. Kasus "seratus"/"seribu"/"sebelas" ada di sini karena
  di sanalah implementasi naif selalu jebol.
- `buildReceiptNumber(seq, paidAt)` → `KW/PKP/2026/0007`; padding 4 digit; seq > 9999 tidak
  terpotong.
- Template kwitansi menghasilkan PDF yang valid (`%PDF-` magic bytes, ukuran > 0) dan
  memuat nomor + nama klien di stream teksnya.

**Batas akses (DB, wajib terbukti gagal kalau guard dicabut):**

- Surveyor memanggil `listPaymentsForProject` proyek yang **di-assign ke dia** → ditolak.
  Ini test terpenting di fitur ini.
- Surveyor memanggil `recordPayment` / `voidPayment` → ditolak.
- Klien A membuka pembayaran proyek klien B → ditolak.
- Klien memanggil `recordPayment` → ditolak.
- Payload proyek surveyor tetap tidak memuat field keuangan (regression yang sudah ada,
  tetap hijau).

**Invarian:**

- `recordPayment` pada proyek tanpa `projectValue` → ditolak.
- Setelah `recordPayment`, `projects.paymentStatus` cocok dengan `derivePaymentStatus`.
- Setelah `voidPayment`, baris itu berhenti dihitung dan status ikut mundur
  (`lunas` → `sebagian` / `belum`).
- **Pembayaran TETAP tercatat walau generate/upload PDF gagal** — mailer-nya storage:
  suntik driver yang melempar, pastikan baris tetap ada dan `receiptFileUrl` null.
  Test ini harus jeblok kalau `try/catch`-nya dicabut.
- Dua `recordPayment` beruntun tidak pernah menghasilkan `receiptNumber` yang sama.

---

## Berkas

| Berkas | Tanggung jawab |
|---|---|
| `lib/db/schema.ts` (modify) | Tabel `payment`, enum `payment_method`, relasi. |
| `drizzle/00xx_*.sql` (generate) | Migrasi + `CREATE SEQUENCE receipt_number_seq`. |
| `lib/db/seed.ts` (modify) | Baris pembayaran yang konsisten dengan status demo. |
| `lib/terbilang.ts` + `.test.ts` (create) | Angka → kata Bahasa Indonesia. Murni. |
| `lib/studio-identity.ts` (create) | Konstanta kop kwitansi. |
| `lib/receipts/template.ts` + `.test.ts` (create) | `buildReceiptPdf(data) → Uint8Array`. Murni. |
| `lib/receipts/index.ts` (create) | `generateAndStoreReceipt`, `regenerateAsVoided`. I/O. |
| `lib/actions/payments-schemas.ts` (create) | Skema input record/void. |
| `lib/actions/payments-logic.ts` + `.test.ts` (create) | Guard + transaksi + derivasi. |
| `lib/actions/payments.ts` (create) | `adminActionClient` wrappers. |
| `lib/actions/finance-schemas.ts` (modify) | Buang `paymentStatus` dari input. |
| `lib/actions/finance-logic.ts` (modify) | `updatePayment` ikut menghitung ulang status. |
| `lib/actions/dashboard-logic.ts` (modify) | `totalUnpaid` eksak. |
| `lib/actions/portal-logic.ts` (modify) | Pembayaran non-batal untuk proyek klien. |
| `components/projects/payment-form.tsx` (modify) | Dropdown status dibuang. |
| `components/payments/payments-panel.tsx` (create) | Panel owner. |
| `components/payments/record-payment-dialog.tsx` (create) | Form catat pembayaran. |
| `components/payments/void-payment-dialog.tsx` (create) | Konfirmasi + alasan. |
| `components/portal/payments-section.tsx` (create) | Read-only untuk klien. |
| `app/dashboard/projects/[id]/page.tsx` (modify) | Render panel (admin saja). |
| `app/portal/projects/[id]/page.tsx` (modify) | Render bagian pembayaran. |
| `app/api/storage/[...key]/route.ts` (modify) | Prefix `receipts/` + guard keuangan. |
| `lib/labels.ts` (modify) | `paymentMethodLabel`. |
| `package.json` | + `pdf-lib`. |

## Keputusan terbuka

Tidak ada. Semua pertanyaan yang muncul saat brainstorm sudah dijawab; yang di luar
lingkup sudah ditulis sebagai "tidak masuk" di atas.
