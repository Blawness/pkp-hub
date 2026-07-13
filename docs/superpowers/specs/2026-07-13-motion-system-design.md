# Sistem Motion + Login Split-Screen — Design

**Tanggal:** 2026-07-13
**Status:** Disetujui, siap masuk perencanaan implementasi
**Prasyarat:** `docs/superpowers/specs/2026-07-13-homepage-gateway-design.md` (halaman gerbang `/` sudah ada di branch `feat/homepage-gateway`)

## Tujuan

Dua hal yang saling mengunci:

1. `/login` memakai layout split-screen yang sama dengan halaman gerbang `/`, sehingga masuk ke aplikasi terasa seperti satu alur onboarding yang berlanjut — bukan dua halaman terpisah.
2. Fondasi sistem motion untuk PKP Hub: token, prinsip, kebijakan aksesibilitas, dan sekumpulan primitif kecil. Fondasinya dirancang untuk seluruh aplikasi, tapi **implementasinya di spec ini hanya menyentuh `/` dan `/login`.** Dashboard, portal, tabel, dialog, dan peta menyusul di spec terpisah, memakai fondasi yang sama.

Ruang lingkup ini dipilih secara sadar (opsi "fondasi dulu, lalu onboarding"): menulis satu spec raksasa untuk seluruh aplikasi berarti menebak-nebak sebelum melihat hasilnya di layar.

## Prinsip Gerak

Karakternya **presisi dan tenang** — bahasa gerak Linear/Vercel/Stripe. Gerakan cepat, pendek, tegas; nyaris tidak disadari, tapi terasa mahal. Ini bukan selera: aplikasi ini dipakai staf berkali-kali sehari, dan animasi yang "tampil" akan berubah jadi pajak waktu pada pemakaian ke-20.

Konsekuensi yang mengikat implementasi:

- **Jarak gerak kecil.** Entrance hanya translate 8–12px. Tidak ada elemen yang menyapu setengah layar.
- **Easing custom, tidak pernah `ease-in-out` bawaan.** Easing default browser adalah penanda paling cepat sebuah UI terasa murah.
- **Tidak ada gerakan tanpa alasan.** Setiap animasi menjelaskan sesuatu: dari mana elemen datang, apa yang berubah, apa yang sedang menunggu.
- **Gerakan tidak pernah menunda pekerjaan.** Tidak ada animasi yang memblokir input atau menahan navigasi.

## Fondasi

### Token motion (`app/globals.css`)

Ditaruh sejajar dengan token warna yang sudah ada, di dalam blok `@theme inline`. Angka durasi dan easing tidak boleh ditulis langsung di komponen — komponen memakai token.

| Token | Nilai | Untuk |
|---|---|---|
| `--motion-fast` | `150ms` | Perubahan state: hover, press, fokus |
| `--motion-base` | `260ms` | Elemen masuk/keluar |
| `--motion-slow` | `420ms` | Panel besar, transisi route |
| `--ease-out-expo` | `cubic-bezier(0.16, 1, 0.3, 1)` | Segala yang masuk — cepat di awal, mendarat halus |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Perubahan state dua arah |
| `--motion-stagger` | `40ms` | Jeda antar elemen dalam satu rangkaian |

### Kebijakan `prefers-reduced-motion`

Wajib, dan bukan sekadar "matikan semua" — mematikan segalanya membuat konten melompat, yang justru lebih buruk.

- **Gerakan posisi (translate, parallax, morph): mati total.**
- **Crossfade opacity: tetap hidup**, dengan durasi `--motion-fast`.
- Parallax kursor dan morph antar-route **tidak dijalankan sama sekali**.

Kebijakan ini ditegakkan di dua lapis: media query di CSS untuk animasi CSS, dan pengecekan di komponen client untuk animasi yang dijalankan `motion` (yang mana harus membaca preferensi lewat hook yang disediakan library, bukan mendeteksi sendiri).

## Komponen

Unit-unit kecil dengan satu tanggung jawab masing-masing.

### `components/brand/brand-panel.tsx` (client component)

Panel navy yang dipakai **bersama** oleh `/` dan `/login` — satu-satunya definisi panel brand di aplikasi. Isinya: wordmark, tagline, daftar layanan, footer copyright, tekstur grid, glow aksen.

Perilaku motion di dalamnya:
- **Parallax grid mengikuti kursor**, maksimum ±6px, diredam dengan spring. Mati pada perangkat sentuh dan saat reduced-motion.
- **Stagger** pada isi panel saat pertama muncul.

Semua logika parallax hidup di file ini dan tidak bocor ke tempat lain.

Karena komponen ini client-side sementara `/` adalah server component yang membaca session, pemisahannya harus dijaga: **`app/page.tsx` tetap server component**; ia merender `BrandPanel` sebagai anak. Redirect berbasis role tidak boleh pindah ke client.

### `components/motion/reveal.tsx` (client component)

Primitif kecil: `<Reveal>` (fade + translate 10px ke atas) dan `<Stagger>` (memberi delay berjenjang `--motion-stagger` ke anak-anaknya). Dipakai kedua halaman sekarang, dan disiapkan untuk dipakai dashboard nanti.

### `app/login/page.tsx`

Disusun ulang menjadi split-screen: `BrandPanel` di kiri, `Card` login di kanan — cermin dari `/`.

**`components/auth/login-form.tsx` tidak diubah logikanya.** Fungsi `sanitizeRedirectTo()` di dalamnya menutup lubang open-redirect dan sudah benar; tidak ada alasan mengutak-atiknya demi animasi. Yang ditambahkan hanya lapisan motion: transisi pada pesan error dan state tombol submit.

### `app/page.tsx`

Panel brand yang saat ini ditulis inline dipindahkan ke `BrandPanel` supaya kedua halaman benar-benar memakai komponen yang sama — bukan dua salinan yang mirip. Logika session dan redirect tidak berubah.

## Morph `/` → `/login`

Panel brand **tidak hilang lalu muncul kembali**. Ia bertahan di tempatnya sementara sisi kanan berganti dari sambutan menjadi form. Efeknya: onboarding yang berlanjut, bukan pindah halaman.

Teknis (diverifikasi terhadap dokumen Next 16 yang ada di `node_modules/next/dist/docs/`):

- `experimental.viewTransition: true` di `next.config.ts`.
- `<ViewTransition name="brand-panel">` dari React membungkus `BrandPanel` di **kedua** halaman.
- `layoutId` milik `motion` **tidak bisa** dipakai untuk ini: `/` dan `/login` adalah dua React tree berbeda, jadi shared-layout animation tidak berlaku antar-route. View Transitions adalah satu-satunya jalan.

**Risiko yang diambil sadar:** `viewTransition` masih berstatus eksperimental di Next 16. Degradasinya aman — tanpa dukungan browser (atau bila flag dicabut), navigasi tetap berjalan normal, hanya tanpa animasi. Kalau flag ini kelak menimbulkan masalah, morph dicabut tanpa menyentuh apa pun selain `next.config.ts` dan dua pembungkus `<ViewTransition>`.

## Inventaris Animasi

Ini daftar lengkapnya. Apa pun di luar daftar ini bukan bagian dari spec.

| Tempat | Gerakan | Token |
|---|---|---|
| Panel brand, saat muncul | Stagger isi panel, fade + translate 10px | `--motion-base`, `--ease-out-expo`, `--motion-stagger` |
| Panel brand, terus-menerus | Parallax grid ±6px mengikuti kursor (spring) | — (spring, bukan durasi) |
| Sisi kanan `/` dan `/login` | Stagger elemen (heading → deskripsi → tombol → kartu) | `--motion-base`, `--ease-out-expo`, `--motion-stagger` |
| Navigasi `/` → `/login` | Morph: panel brand bertahan, sisi kanan berganti | `--motion-slow` |
| Tombol | Press-state fisik (skala turun tipis) | `--motion-fast`, `--ease-standard` |
| Pesan error form | Fade + translate masuk | `--motion-fast`, `--ease-out-expo` |
| Tombol submit saat mengirim | State menunggu (spinner) | `--motion-fast` |

## Dependency

Satu paket baru: **`motion`** (v12, penerus `framer-motion`; impor dari `motion/react`). Disetujui pemilik repo. Tidak ada paket lain yang ditambahkan.

Komponen `motion` adalah client-side. Setiap pemakaiannya harus berada di file dengan `"use client"`, dan tidak boleh menarik logika server (session, query DB) ikut ke client.

## Pengujian

Vitest di repo ini berjalan dengan `environment: "node"` — tanpa jsdom, tanpa React Testing Library. **Animasi tidak bisa diuji otomatis di sini, dan spec ini tidak akan berpura-pura mengujinya.** Menulis test yang "menguji" animasi tanpa DOM hanya menghasilkan test yang lolos tanpa membuktikan apa pun.

Yang dijaga otomatis:
- 99 test yang sudah ada tetap hijau — khususnya guard dan scoping tenant. Perubahan di `/login` dan `/` tidak boleh menyentuhnya.
- `pnpm typecheck` dan `pnpm lint` bersih.

Yang diverifikasi dengan mata, di browser (dan harus dinyatakan apa adanya, bukan diklaim lolos tanpa dilihat):
- Morph `/` → `/login`: panel brand bertahan, tidak berkedip.
- Parallax hanya jalan di perangkat berkursor.
- Dengan "reduce motion" aktif di OS: tidak ada gerakan posisi sama sekali, crossfade tetap ada, tidak ada konten yang melompat.

## Kriteria Selesai

1. `/login` tampil split-screen, memakai `BrandPanel` yang **sama persis** dengan `/` (satu komponen, bukan dua salinan).
2. Navigasi `/` → `/login` memorf: panel brand bertahan di tempat.
3. Token motion ada di `app/globals.css`; tidak ada durasi/easing yang ditulis langsung di komponen.
4. Dengan `prefers-reduced-motion: reduce`: nol gerakan posisi, crossfade tetap hidup, tidak ada lompatan konten.
5. Parallax mati di perangkat sentuh.
6. Redirect berbasis role di `/` tetap berjalan (owner/surveyor → `/dashboard`, client → `/portal`), dan `sanitizeRedirectTo()` di `login-form.tsx` tidak berubah.
7. 99 test existing tetap hijau; typecheck dan lint bersih.

## Di Luar Ruang Lingkup

- Motion di dashboard, portal, tabel, dialog, sheet, peta, toast. Menyusul, memakai fondasi yang sama.
- Panel brand yang **ikut bergeser** saat morph. Terlihat hebat di demo, mengganggu pada pemakaian ke-20. Ditolak secara sadar.
- Mengubah logika `login-form.tsx`.
