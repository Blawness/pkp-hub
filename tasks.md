# Task List: PKP Hub — Survey Studio Management Dashboard

Breakdown eksekusi untuk Claude Code. Kerjakan per fase, urut — tiap fase punya dependency ke fase sebelumnya kecuali ditandai paralel. Centang saat selesai. Referensi lengkap: `PRD.md`.

**Konvensi:** semua task mengikuti Vorca canonical stack (`docs/vorca-default-stack.md`). Jangan tambahkan dependency di luar PRD tanpa menandainya sebagai keputusan.

---

## Phase 0 — Project Setup
- [ ] Scaffold Next.js (latest, App Router, TS strict) + pnpm
- [ ] Setup Tailwind + shadcn/ui, import brand palette Vorca (CSS variables: `#0A0D14`, `#1B6FD8`, `#3FA3FF`)
- [ ] Setup Biome (lint + format), `@t3-oss/env-nextjs`
- [ ] Setup Drizzle + koneksi Postgres (local dev), config `DATABASE_URL`
- [ ] `.env.example` sesuai PRD §8 (DB, Better Auth, R2, Resend)

## Phase 1 — Data Layer  *(blocked by: Phase 0)*
- [ ] Drizzle schema untuk semua entity PRD §5: `Client`, `Project`, `ProjectStatusLog`, `MapLayer`, `Document` (+ field `role` di user)
- [ ] Enum: `ProjectStatus`, `SurveyType`, `PaymentStatus`, `DocumentCategory`, `UserRole`
- [ ] Generate + jalankan migration awal
- [ ] Seed data dummy: 1 owner, 2 surveyor, 3 klien, beberapa proyek lintas status

## Phase 2 — Auth & Roles  *(blocked by: Phase 1)*
- [ ] Setup Better Auth + adapter Drizzle
- [ ] 3 role: `owner`, `surveyor`, `client` (PRD §2)
- [ ] Middleware / route guards: area `(dashboard)` = owner+surveyor, area `(portal)` = client
- [ ] Helper scoping row-level (client hanya akses proyek dengan `clientId` miliknya) — WAJIB diuji
- [ ] Flow undangan akun klien (`inviteClientUser`) via email (Resend) — opsional per klien

## Phase 3 — Klien & Proyek (Core)  *(blocked by: Phase 2)*
> Tiap fitur: server action (next-safe-action + Zod) → UI (shadcn + RHF + TanStack Table) → acceptance criteria PRD hijau.
- [ ] Feature 1 — Manajemen Klien: CRUD + soft delete + detail (daftar proyek klien)
- [ ] Feature 2 — Manajemen Proyek: CRUD, assign surveyor, filter (status/klien/surveyor/jenis)
- [ ] Status pipeline + `changeProjectStatus` yang menulis `ProjectStatusLog`
- [ ] Scoping: surveyor hanya lihat proyek yang di-assign

## Phase 4 — Arsip Dokumen  *(blocked by: Phase 3)*
- [ ] Setup storage (Cloudflare R2 / UploadThing) + `.env`
- [ ] `uploadDocument`: upload file + simpan metadata (kategori, uploader, ukuran)
- [ ] UI arsip per proyek + preview PDF/gambar in-app
- [ ] Search & filter dokumen lintas proyek (nama, kategori, klien, tanggal)
- [ ] Toggle `sharedWithClient` (internal vs shared)

## Phase 5 — Modul Peta  *(blocked by: Phase 3)*
- [ ] Wrapper Leaflet (react-leaflet) sebagai client component; layer OSM + toggle citra satelit gratis
- [ ] Draw polygon/titik manual → simpan GeoJSON (`saveMapLayer`)
- [ ] Hitung luas otomatis (turf.js), tampilkan m² & ha
- [ ] `importMapCsv`: parse CSV koordinat (papaparse) → GeoJSON → `MapLayer`
- [ ] Beberapa layer/versi per proyek
- [ ] ⚠️ Reproyeksi UTM→WGS84 (proj4js) jika data lapangan UTM — lihat Open Decisions
- [ ] (Enhancement, bukan v1) Import DXF

## Phase 6 — Keuangan Ringan  *(blocked by: Phase 3)*
- [ ] `updatePayment`: nilai proyek + status bayar (`Belum`/`Sebagian`/`Lunas`) + catatan
- [ ] Guard: hanya owner/admin edit & lihat; surveyor tidak
- [ ] Ringkasan keuangan di dashboard owner (total aktif, total belum terbayar)

## Phase 7 — Portal Klien & Dashboard  *(blocked by: Phase 4, 5, 6)*
- [ ] Area `(portal)`: daftar proyek klien + detail (status, peta, dokumen shared, luas, nilai & status bayar)
- [ ] Uji ketat: client TIDAK bisa akses proyek klien lain (row-level)
- [ ] Dashboard ringkasan per role (owner / surveyor / client) — PRD Feature 7

## Phase 8 — Polish
- [ ] Loading / empty / error states
- [ ] Responsive check (mobile-first) — peta & tabel di layar kecil
- [ ] Accessibility pass dasar (focus, alt, kontras)
- [ ] SEO/metadata dasar (app internal, minimal)

## Phase 9 — Deploy
- [ ] Swap `DATABASE_URL` ke Neon (prod), jalankan migration
- [ ] Deploy ke Vercel, set env production (DB, Better Auth, R2, Resend)
- [ ] Smoke test end-to-end per role di prod

---

## Open Decisions (dari PRD §10)
- [ ] Geospasial storage: `jsonb` + turf (default) vs PostGIS — putuskan sebelum Phase 5
- [ ] Sistem koordinat import: lat/long langsung vs perlu reproyeksi UTM→WGS84 (proj4js) — konfirmasi format alat studio
- [ ] Import DXF: format alat (total station/GPS RTK) apa? Tunda ke setelah v1
- [ ] Storage: Cloudflare R2 (default) vs UploadThing
- [ ] Undangan portal: semua klien vs opsional per klien (asumsi: opsional)
