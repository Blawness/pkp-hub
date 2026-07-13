# Handoff: PKP Hub → Claude Code

> Paste blok di bawah ke Claude Code di root folder project. Taruh `PRD.md` dan `tasks.md` di root yang sama sebelum menjalankan.

---

Kamu akan membangun **PKP Hub**, sebuah internal management dashboard untuk studio jasa survey & pengukuran tanah/bangunan — untuk mengelola klien, proyek survey, peta hasil ukur, arsip dokumen, keuangan ringan, plus portal read-only untuk klien.

**Baca dulu sebelum menulis kode apa pun:**
1. `PRD.md` — spec produk lengkap (7 fitur, data model, server actions, struktur, env).
2. `tasks.md` — urutan eksekusi per fase (Phase 0–9). Kerjakan berurutan, hormati dependency antar fase.

**Tech stack — WAJIB, jangan menyimpang:**
Next.js (latest, App Router, Server Components default) · TypeScript strict · Tailwind + shadcn/ui · **Drizzle ORM** · PostgreSQL (local dev → **Neon** prod, swap `DATABASE_URL`) · **Better Auth** (3 role: owner, surveyor, client) · Zod + React Hook Form · next-safe-action · `@t3-oss/env-nextjs` · Biome · Lucide · pnpm · Vercel. Peta = **Leaflet + react-leaflet** (OSM + citra satelit gratis) dengan **turf.js** untuk luas; GeoJSON disimpan di kolom `jsonb`. File storage = **Cloudflare R2** (S3-compatible). CSV parsing = papaparse. Jangan pakai Prisma, Supabase, NextAuth, Clerk, atau Mapbox. Tidak ada payment gateway di v1.

**Karakter proyek yang perlu ekstra hati-hati:**
- **Row-level scoping wajib.** Role `client` hanya boleh mengakses proyek dengan `clientId` miliknya. Uji ini eksplisit — ini risiko keamanan utama karena ada portal eksternal.
- **Dua area terpisah:** `(dashboard)` untuk staf (owner/surveyor), `(portal)` untuk klien. Guard di proxy.ts (coarse) + auth-guards.ts (boundary).
- **Peta:** komponen Leaflet harus client component; render dinamis (no SSR) untuk hindari error `window`.
- **Import koordinat:** mulai dari CSV (papaparse). Kalau data lapangan UTM (bukan lat/long), reproyeksi ke WGS84 dulu (proj4js) — ini Open Decision, konfirmasi sebelum implement Phase 5.

**Cara kerja:**
- Mulai dari `tasks.md` Phase 0, kerjakan turun. Update checklist saat selesai.
- Untuk tiap fitur, penuhi acceptance criteria di `PRD.md` §3 sebelum lanjut.
- Kalau ketemu keputusan di luar stack (lihat PRD §10 Open Questions: PostGIS, DXF, sistem koordinat, storage), berhenti dan tanya — jangan asal pilih.
- Commit per fase dengan pesan yang jelas.

Mulai dengan mengonfirmasi rencana Phase 0, lalu jalan.
