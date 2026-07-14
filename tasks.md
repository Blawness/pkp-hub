# Task List: PKP Hub — Survey Studio Management Dashboard

Breakdown eksekusi untuk Claude Code. Kerjakan per fase, urut — tiap fase punya dependency ke fase sebelumnya kecuali ditandai paralel. Centang saat selesai. Referensi lengkap: `PRD.md`.

**Konvensi:** semua task mengikuti Vorca canonical stack (`docs/vorca-default-stack.md`). Jangan tambahkan dependency di luar PRD tanpa menandainya sebagai keputusan.

---

## Phase 0 — Project Setup
- [x] Scaffold Next.js (latest, App Router, TS strict) + pnpm
- [x] Setup Tailwind + shadcn/ui, import brand palette Vorca (CSS variables: `#0A0D14`, `#1B6FD8`, `#3FA3FF`)
- [x] Setup Biome (lint + format), `@t3-oss/env-nextjs`
- [x] Setup Drizzle + koneksi Postgres (local dev), config `DATABASE_URL` — *koneksi menunggu DB `pkp_hub` dibuat*
- [x] `.env.example` sesuai PRD §8 (DB, Better Auth, R2, Resend)

## Phase 1 — Data Layer  *(blocked by: Phase 0)*
- [x] Drizzle schema untuk semua entity PRD §5: `Client`, `Project`, `ProjectStatusLog`, `MapLayer`, `Document` (+ field `role` di user)
- [x] Enum: `ProjectStatus`, `SurveyType`, `PaymentStatus`, `DocumentCategory`, `UserRole` (+ `MapLayerSource`)
- [x] Generate + jalankan migration awal — applied ke Neon (`0000_cute_scrambler`)
- [x] Seed data dummy: 1 owner, 2 surveyor, 3 klien, 5 proyek lintas status — *user belum punya password; kredensial dipasang di Phase 2 lewat Better Auth*

## Phase 2 — Auth & Roles  *(blocked by: Phase 1)*
- [x] Setup Better Auth + adapter Drizzle (pakai tabel Phase 1, tanpa migration baru)
- [x] 3 role: `owner`, `surveyor`, `client` (PRD §2)
- [x] Middleware / route guards: `/dashboard` = owner+surveyor, `/portal` = client (guard server-side = boundary, DB-backed)
- [x] Helper scoping row-level (client hanya akses proyek dengan `clientId` miliknya) — 12 test hijau, terbukti gagal kalau guard dicabut
- [x] Flow undangan akun klien (`inviteClientUser`) via email (Resend) — degrade ke console log kalau `RESEND_API_KEY` kosong

## Phase 3 — Klien & Proyek (Core)  *(blocked by: Phase 2)*
> Tiap fitur: server action (next-safe-action + Zod) → UI (shadcn + RHF + TanStack Table) → acceptance criteria PRD hijau.
- [x] Feature 1 — Manajemen Klien: CRUD + soft delete + detail (daftar proyek klien)
- [x] Feature 2 — Manajemen Proyek: CRUD, assign surveyor, filter (status/klien/surveyor/jenis)
- [x] Status pipeline + `changeProjectStatus` yang menulis `ProjectStatusLog`
- [x] Scoping: surveyor hanya lihat proyek yang di-assign — 6 test baru hijau, terbukti gagal kalau guard dicabut

## Phase 4 — Arsip Dokumen  *(blocked by: Phase 3)*
- [x] Setup storage (Cloudflare R2 + fallback disk lokal `.storage/` saat env R2 kosong) + `.env`
- [x] `uploadDocument`: presigned/route-handler upload + simpan metadata (kategori, uploader, ukuran)
- [x] UI arsip per proyek + preview PDF/gambar in-app
- [x] Search & filter dokumen lintas proyek (nama, kategori, klien, tanggal) — server-side, scoped ke surveyor
- [x] Toggle `sharedWithClient` (internal vs shared) — owner-only

## Phase 5 — Modul Peta  *(blocked by: Phase 3)*
- [x] Wrapper Leaflet (react-leaflet) sebagai client component (`next/dynamic`, `ssr:false`); layer OSM + toggle citra satelit (Esri World Imagery)
- [x] Draw polygon/titik manual (leaflet-draw) → simpan GeoJSON (`saveMapLayer`)
- [x] Hitung luas otomatis (turf.js), tampilkan m² & ha (id-ID locale)
- [x] `importMapCsv`: parse CSV koordinat (papaparse) → GeoJSON → `MapLayer`, auto-detect format + preview sebelum commit
- [x] Beberapa layer/versi per proyek — list, toggle visibility, hapus
- [x] Reproyeksi UTM→WGS84 (proj4js), zona 46-54 pilihan user, default 48S
- [ ] (Enhancement, bukan v1) Import DXF

## Phase 6 — Keuangan Ringan  *(blocked by: Phase 3)*
- [x] `updatePayment`: nilai proyek + status bayar (`Belum`/`Sebagian`/`Lunas`) + catatan — owner-only (2 lapis)
- [x] Guard: hanya owner edit & lihat; surveyor tidak — field finance di-omit server-side dari payload surveyor (bukan CSS), ada regression test
- [x] Ringkasan keuangan di dashboard owner (total aktif, total belum terbayar; `dibatalkan` dikecualikan)

## Phase 7 — Portal Klien & Dashboard  *(blocked by: Phase 4, 5, 6)*
- [x] Area `/portal`: daftar proyek klien + detail (status, peta read-only, dokumen shared saja, luas, nilai & status bayar read-only)
- [x] Uji ketat: client TIDAK bisa akses proyek klien lain — terbukti 404 live dengan cookie session
- [x] Dashboard ringkasan per role (owner / surveyor / client) — PRD Feature 7

## Phase 8 — Polish
- [x] Loading / empty / error states — `loading.tsx` skeleton tiap segmen lambat, `error.tsx` (root/dashboard/portal) + `not-found.tsx`, `EmptyState` di semua list/peta/dokumen yang bisa kosong
- [x] Responsive check (mobile-first) — peta & tabel di layar kecil — nav collapse ke `Sheet` di `sm`, tabel sudah scroll horizontal via `Table` wrapper, peta `h-[320px] sm:h-[500px]`, tab list scrollable
- [x] Accessibility pass dasar (focus, alt, kontras) — audit fokus/aria-label/alt sudah ada di sebagian besar komponen; ditambah aria-label toggle share, region label peta, keyboard tab pass diverifikasi via Playwright
- [x] SEO/metadata dasar (app internal, minimal) — title template per area + `generateMetadata` per detail page, `robots: noindex`

## Phase 9 — Deploy
- [x] Repo publik di GitHub (`Blawness/pkp-hub`) — di-push ke `master`
- [x] `DEPLOY.md` lengkap (setup Vercel, daftar env, migrasi prod, smoke-test per role)
- [x] README ditulis ulang dari template default Next.js
- [x] Storage driver beri peringatan (tidak crash) bila lokal dipakai di production
- [x] **Verifikasi lokal hijau**: `pnpm typecheck`, `pnpm lint`, `pnpm test` (96 test),
      `pnpm build` (production build sukses dengan env placeholder) — semua pass
- [x] **Human action** — project Vercel dibuat (`blawness-projects/pkp-hub`), live di
      https://pkp-hub.vercel.app. Env production terpasang: `DATABASE_URL`,
      `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `R2_*`.
      **`RESEND_API_KEY` belum dipasang** — lihat Phase 11.
- [x] **Human action** — migrasi ke Neon prod (deploy production `● Ready`, aplikasi
      berjalan; env prod di-mark *Sensitive* sehingga tidak bisa diverifikasi ulang
      dari luar Vercel).
- [~] **Human action** — smoke test end-to-end per role di prod (checklist DEPLOY.md §7)
  - [x] Bagian anonim (2026-07-14, terhadap https://pkp-hub.vercel.app):
        `/` gerbang tampil 200 · `/login` 200 · `/dashboard`, `/dashboard/projects`,
        `/portal` semua 307 ke `/login?redirectTo=...` · `<meta name="robots">` =
        `noindex, nofollow`.
  - [ ] Bagian per-role (owner / surveyor / client) — **belum jalan, butuh manusia.**
        Semua env production di-mark *Sensitive* di Vercel, jadi `vercel env pull`
        mengembalikan nilai kosong: DB prod tidak bisa disentuh dari luar dan kredensial
        login per role tidak tersedia untuk agent. Butuh seseorang dengan akun prod
        menjalankan DEPLOY.md §7 (Owner / Surveyor / Client) di browser.

> Kode & verifikasi lokal selesai; aplikasi sudah live di production. Yang tersisa
> murni butuh akses manusia: smoke test per role, dan `RESEND_API_KEY` + domain
> pengirim (Phase 11).

---

## Phase 10 — Pasca-v1: UX & akun  *(selesai, merged ke `master`)*
> Tidak ada di PRD asli — muncul setelah v1 dipakai. Masing-masing punya spec + plan
> di `docs/superpowers/`.
- [x] Homepage sebagai gerbang internal: split-screen, redirect otomatis ke area sesuai
      role untuk user yang sudah login (`docs/superpowers/specs/2026-07-13-homepage-gateway-design.md`)
- [x] Sistem motion: token durasi/easing di `globals.css`, kebijakan `prefers-reduced-motion`
      global, primitif `Reveal`/`Stagger`, `BrandPanel` bersama `/` + `/login`
      (`docs/superpowers/specs/2026-07-13-motion-system-design.md`)
- [x] Halaman profil: user mengganti nama & password sendiri (staf + klien), minimal 10
      karakter ditegakkan **di server**, bukan cuma klien
      (`docs/superpowers/specs/2026-07-13-halaman-profil-design.md`)
- [x] Unduhan dokumen lewat presigned URL — bucket R2 tetap privat

## Phase 11 — Notifikasi status ke klien  *(kode selesai; belum aktif di prod)*
> Menyerang success metric PRD §9 ("berkurangnya chat manual *gimana progress?*").
> Riwayat status sudah tampil di portal sejak Phase 7 — yang hilang adalah dorongannya:
> klien tidak pernah tahu ada perubahan kecuali ia membuka portal sendiri.
- [x] `lib/email.ts` — `sendEmail()` membungkus Resend, fallback console-log saat
      `RESEND_API_KEY` kosong. Flow undangan klien (`lib/auth.ts`) ikut memakainya, jadi
      alamat pengirim & perilaku fallback cuma didefinisikan di satu tempat.
- [x] `buildStatusChangeEmail()` — murni, tanpa I/O; pakai `statusLabel` sehingga enum
      mentah (`data_diambil`) tidak pernah bocor ke klien. Tautan portal hanya disertakan
      kalau klien punya akun portal.
- [x] `notifyClientOfStatusChange()` — penerima SELALU diturunkan dari `project.clientId`
      di server, tidak pernah dari input pemanggil.
- [x] Dipicu di `changeProjectStatusForUser` **di luar transaksi**, errornya ditelan +
      di-log. Alasan: kalau email dikirim di dalam transaksi, Resend yang down bikin studio
      tidak bisa memajukan status sama sekali — notifikasi tidak boleh mengalahkan
      pekerjaan sungguhan. Dikunci test: "status TETAP berubah walau pengiriman email
      gagal" — terbukti jeblok kalau `try/catch`-nya dicabut.
- [ ] **Human action** — verifikasi domain pengirim di Resend, lalu ganti `EMAIL_FROM`
      di `lib/email.ts`. Sekarang masih `onboarding@resend.dev` (domain sandbox Resend:
      **hanya bisa mengirim ke alamat pemilik akun**, bukan ke klien sungguhan).
- [ ] **Human action** — pasang `RESEND_API_KEY` di env production Vercel. Tanpa ini
      notifikasi cuma ter-log ke konsol server, tidak terkirim.

## Phase 12 — Ledger pembayaran & kwitansi  *(kode selesai)*
> Spec: `docs/superpowers/specs/2026-07-14-ledger-pembayaran-kwitansi-design.md`.
> Menyerang keluhan "nilai proyek tanpa bukti bayar": `paymentStatus` dulu cuma
> dropdown yang tidak terhubung ke uang mana pun, dan `sebagian` tidak menyimpan
> BERAPA yang sudah masuk.
- [x] Tabel `payment` append-only (koreksi = batalkan + terbitkan ulang, bukan edit)
      — jejak uang tidak pernah ditimpa diam-diam.
- [x] `paymentStatus` jadi kolom TURUNAN, dihitung ulang di dalam transaksi yang sama
      dengan setiap perubahan yang memicunya. Dropdown manualnya dibuang: owner tidak
      bisa lagi menandai proyek lunas tanpa mencatat uangnya.
- [x] Kwitansi PDF ber-nomor (sequence Postgres — tidak bisa kembar), disimpan di R2 di
      bawah prefix `receipts/`. Pembatalan menerbitkan ulang PDF dengan cap DIBATALKAN.
- [x] Kwitansi **bukan** baris `documents`: modul Arsip terlihat surveyor, dan kwitansi
      memuat nilai proyek. Ia hidup di `payment.receiptFileUrl`, di balik guard keuangan.
      Rute storage lokal menolak surveyor untuk prefix `receipts/` secara eksplisit —
      `assertProjectAccess` MELOLOSKAN surveyor yang di-assign, jadi ia tidak cukup.
- [x] Kwitansi di-generate DI LUAR transaksi, errornya ditelan + di-log. Dikunci test:
      "pembayaran TETAP tercatat walau kwitansi gagal dibuat" — jeblok kalau try/catch
      dicabut. Alasan sama dengan notifikasi Phase 11: pekerjaan sampingan tidak boleh
      mengalahkan pekerjaan sungguhan.
- [x] Piutang dashboard jadi eksak (nilai proyek − uang yang benar-benar masuk); dulu
      menghitung `projectValue` PENUH untuk proyek yang DP-nya sudah 80% masuk.
- [x] Portal klien: riwayat pembayaran, sisa tagihan, unduh kwitansi sendiri.
- [ ] **Human action** — `lib/studio-identity.ts` sudah berisi alamat/telepon/email/kota
      asli (dari presisikonsulindo.com). Yang belum dikonfirmasi: `signerName` (nama
      direktur penanda tangan) — ganti sebelum kwitansi pertama dikirim ke klien.

---

## Open Decisions (dari PRD §10)
- [x] Geospasial storage → **`jsonb` + turf.js**. PostGIS belum diperlukan: tidak ada
      query spasial, hanya display & arsip.
- [x] Sistem koordinat import → **perlu reproyeksi**. Sudah diimplementasikan (proj4js,
      UTM zona 46–54, default 48S), bukan lat/long langsung.
- [x] Storage → **Cloudflare R2**, bucket privat + unduhan via presigned URL. Fallback
      disk lokal `.storage/` hanya untuk dev (memberi peringatan kalau dipakai di prod).
- [x] Undangan portal → **opsional per klien** (`clients.userId` nullable; admin mengundang
      manual lewat `inviteClientUser`).
- [ ] Import DXF: format alat (total station/GPS RTK) apa? Masih ditunda — butuh konfirmasi
      alat yang dipakai studio sebelum bisa dimulai.
