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
- [ ] **Human action** — buat project Vercel, set env production (DB, Better Auth, R2, Resend)
- [ ] **Human action** — jalankan migrasi ke Neon prod (`DATABASE_URL` prod, jangan seed)
- [ ] **Human action** — smoke test end-to-end per role di prod (lihat checklist DEPLOY.md §7)

> Semua langkah kode & verifikasi selesai. Tiga item terakhir butuh akses akun
> Vercel / Neon prod / Cloudflare R2 / Resend milik manusia — tidak bisa dijalankan
> dari environment build. `vercel` CLI sudah ter-autentikasi (`blawness`); deploy
> bisa dipicu begitu env production tersedia.

---

## Open Decisions (dari PRD §10)
- [ ] Geospasial storage: `jsonb` + turf (default) vs PostGIS — putuskan sebelum Phase 5
- [ ] Sistem koordinat import: lat/long langsung vs perlu reproyeksi UTM→WGS84 (proj4js) — konfirmasi format alat studio
- [ ] Import DXF: format alat (total station/GPS RTK) apa? Tunda ke setelah v1
- [ ] Storage: Cloudflare R2 (default) vs UploadThing
- [ ] Undangan portal: semua klien vs opsional per klien (asumsi: opsional)
