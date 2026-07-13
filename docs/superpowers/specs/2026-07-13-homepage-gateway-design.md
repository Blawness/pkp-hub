# Homepage sebagai Gerbang Internal — Design

**Tanggal:** 2026-07-13
**Status:** Disetujui, siap masuk perencanaan implementasi

## Masalah

`app/page.tsx` masih placeholder Phase 0: judul, satu kalimat deskripsi, dan teks
"Phase 0 selesai. Auth dan dashboard menyusul." Padahal dashboard, portal, dan auth
sudah jadi. Root URL adalah hal pertama yang dilihat orang saat membuka aplikasi, dan
saat ini isinya tidak mencerminkan produk yang sudah ada di belakangnya.

## Keputusan: gerbang internal, bukan landing page publik

PKP Hub adalah alat internal. `app/layout.tsx` sudah menyetel
`robots: { index: false, follow: false }`, dan halaman login menyebut dirinya
"Internal dashboard for staff, client portal for survey clients". Homepage karena itu
**tidak** dibuat sebagai company profile publik untuk calon klien. Perannya adalah
pintu masuk: memperkenalkan aplikasi secara singkat, lalu mengarahkan orang ke login.

Konsekuensinya, kita tidak menambah konten pemasaran (portofolio, harga, form kontak)
dan tidak mengubah setelan `robots`.

## Perilaku

`app/page.tsx` menjadi server component yang membaca session lalu bercabang:

| Kondisi | Hasil |
|---|---|
| Belum login | Tampilkan halaman gerbang (di bawah) |
| Login sebagai `owner` atau `surveyor` | `redirect("/dashboard")` |
| Login sebagai `client` | `redirect("/portal")` |

Session dibaca lewat `getSession()` dari `lib/auth-guards.ts`. Helper itu sudah ada,
mengembalikan `null` saat tidak terautentikasi, dan tidak pernah melempar — jadi cocok
untuk halaman yang boleh diakses publik. **Tidak ada helper auth baru yang dibuat**, dan
tidak ada jalur auth baru: `requireUser` / `requireRole` sengaja tidak dipakai di sini
karena keduanya memaksa redirect ke `/login`, yang justru membuat gerbangnya mustahil
dilihat.

Redirect ini murni kenyamanan, bukan batas keamanan. Batas keamanan tetap ada di
`lib/auth-guards.ts` seperti yang tertulis di header file itu; homepage tidak menyentuh
data proyek atau klien sama sekali.

## Tata Letak

Split screen. Dua kolom sejajar mulai dari breakpoint `lg`, menumpuk jadi satu kolom di
bawah itu (panel brand menyusut jadi header ringkas di atas, bukan hilang).

### Panel kiri — brand

- Latar `--brand-base` (navy `#0a0d14`), teks terang.
- Wordmark "PKP Hub".
- Tagline: *"Presisi dalam setiap ukuran."*
- Tiga layanan: Survey topografi, Pengukuran lahan, Pemetaan digital.
- Pola grid/kontur tipis memakai `--brand-accent` sebagai tekstur latar. Dibuat dengan
  CSS murni (`background-image` berbasis gradient), **bukan file gambar** — tidak ada
  aset baru yang perlu di-commit atau dioptimasi.
- Footer: copyright Presisi Konsulindo Prima.

### Panel kanan — aksi

- Heading sambutan + deskripsi singkat aplikasi.
- Tombol primary "Masuk" → `/login`.
- Dua kartu penjelas: **Area Staf** (kelola proyek, surveyor, dokumen, invoice) dan
  **Portal Klien** (pantau progres proyek, unduh dokumen hasil).

Kartu-kartu itu **informatif, bukan tautan.** Kedua area sama-sama menuntut login, dan
area mana yang didapat user ditentukan oleh role di akunnya, bukan oleh apa yang ia klik.
Kalau kartunya dibuat bisa diklik, keduanya cuma akan mendarat di `/login` yang sama —
itu menjanjikan pilihan yang sebenarnya tidak ada.

## Catatan Salinan Teks

Tagline dan ketiga nama layanan di atas **tidak diambil dari sumber resmi perusahaan** —
itu usulan yang disetujui pemilik repo pada 2026-07-13 sebagai teks awal. Kalau nanti ada
salinan resmi dari Presisi Konsulindo Prima, ganti langsung di `app/page.tsx`; tidak ada
logika yang bergantung pada teks tersebut.

## Batasan Implementasi

- Pakai komponen yang sudah ada: `components/ui/button.tsx`, `components/ui/card.tsx`.
- Pakai token warna yang sudah ada di `app/globals.css` (`--brand-base`, `--brand-primary`,
  `--brand-accent`). Tidak menambah token baru.
- **Tidak menambah dependency apa pun.**
- Bahasa antarmuka: Indonesia, mengikuti bahasa yang dipakai di seluruh dashboard.

## Kriteria Selesai

1. Pengunjung anonim di `/` melihat halaman gerbang, bukan placeholder Phase 0.
2. Login sebagai `owner@pkp.test`, buka `/` → mendarat di `/dashboard`.
3. Login sebagai `andi@klien.test`, buka `/` → mendarat di `/portal`.
4. Tombol "Masuk" membawa ke `/login`.
5. Layout utuh dan terbaca di lebar mobile (375px) sampai desktop; tidak ada scroll
   horizontal.
6. `tsc --noEmit` lolos.
