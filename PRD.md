# PRD: PKP Hub — Survey Studio Management Dashboard

**Version:** 1.0
**Date:** 2026-07-12
**Author:** Yudha / Vorca Studio (untuk: PT Presisi Konsulindo Prima — PKP)
**Status:** Draft

---

## 1. Overview

### 1.1 Product Summary
PKP Hub adalah **internal management dashboard** untuk **Presisi Konsulindo Prima (PKP)**, studio jasa survey & pengukuran tanah/bangunan (topografi, kavling, batas tanah, luas bangunan). Satu tempat untuk mengelola klien, proyek survey, data peta hasil ukur, dan arsip dokumen — menggantikan alur lama yang tersebar di Excel, WhatsApp, dan folder Drive.

Selain dipakai staf studio (owner + surveyor), sistem menyediakan **portal klien**: tiap klien punya akun untuk melihat progress proyek, peta hasil ukur, dan arsip dokumennya sendiri. Ditambah **modul keuangan ringan** untuk mencatat nilai proyek dan status pembayaran, tanpa generate invoice penuh.

### 1.2 Goals
- Semua data klien, proyek, peta, dan dokumen tersimpan terpusat dan bisa dicari cepat (arsip proyek lama diakses dalam detik, bukan bongkar folder).
- Data ukur lapangan (dari GPS RTK / total station) bisa di-import dan divisualisasikan sebagai peta interaktif dengan luas terhitung otomatis.
- Klien bisa self-service melihat progress & hasil proyeknya tanpa perlu chat manual ke studio.
- Owner punya visibilitas nilai proyek & status pembayaran di satu tampilan.

### 1.3 Non-Goals (Out of Scope for v1)
- Generate invoice PDF / akuntansi penuh (modul keuangan hanya nilai proyek + status bayar).
- Payment gateway / bayar online (pembayaran di-track manual dulu).
- Editing/redrawing geospasial tingkat CAD (import & tampilkan, bukan menggantikan AutoCAD).
- Penjadwalan surveyor / kalender lapangan otomatis (reserved for later).
- Multi-studio / multi-tenant SaaS — ini tool untuk satu studio.
- Mobile native app / AI-ML training (selalu out of scope untuk Vorca).

---

## 2. Users & Roles

| Role | Deskripsi | Akses inti |
|---|---|---|
| **Owner / Admin** | Pemilik studio | Full access: kelola user, semua klien, semua proyek, peta, arsip, keuangan. |
| **Surveyor** | Staf lapangan / drafter | Lihat & kerjakan proyek yang di-assign: update status, import data ukur, upload dokumen. Tidak lihat keuangan. |
| **Client** | Pemesan survey (portal) | Read-only pada proyek miliknya sendiri: status, peta, arsip dokumen, nilai & status bayar. |

Auth: **Better Auth**. Semua role satu sistem auth, dibedakan dengan `role` + row-level scoping (client hanya bisa akses proyek yang `clientId`-nya miliknya).

---

## 3. Core Features (MVP)

### Feature 1: Manajemen Klien
CRUD klien (perorangan / perusahaan) dengan kontak & catatan. Tiap klien bisa di-link ke satu akun user (role Client) untuk akses portal.

**Acceptance criteria:**
- [ ] Owner/Admin bisa create, edit, arsipkan klien (soft delete).
- [ ] Field: nama, tipe (perorangan/perusahaan), telepon, email, alamat, catatan.
- [ ] Bisa undang klien via email untuk aktivasi akun portal (opsional per klien).
- [ ] Halaman detail klien menampilkan daftar semua proyeknya.

### Feature 2: Manajemen Proyek + Status Pipeline
Unit kerja utama. Tiap proyek milik satu klien, punya jenis survey, lokasi, surveyor yang di-assign, dan status pipeline.

**Acceptance criteria:**
- [ ] Field: judul, klien, jenis (topografi / kavling / batas tanah / luas bangunan / lainnya), alamat/lokasi lahan, surveyor assigned, tanggal order, deskripsi.
- [ ] Status pipeline: `Baru` → `Dijadwalkan` → `Data Diambil` → `Diproses` → `Selesai` (+ `Dibatalkan`).
- [ ] Papan/daftar proyek bisa difilter by status, klien, surveyor, jenis.
- [ ] Surveyor hanya melihat proyek yang di-assign ke dirinya.
- [ ] Riwayat perubahan status tercatat (timestamp + oleh siapa).

### Feature 3: Modul Peta (Import + Visualisasi)
Peta interaktif per proyek berbasis Leaflet + OpenStreetMap / citra satelit gratis. Surveyor bisa gambar polygon manual **dan** import data ukur dari file.

**Acceptance criteria:**
- [ ] Peta Leaflet dengan layer OSM + toggle citra satelit (Esri World Imagery / sejenis gratis).
- [ ] Gambar polygon & titik manual di peta; simpan sebagai GeoJSON.
- [ ] **Import file koordinat CSV** (kolom: id/nama, X/easting, Y/northing atau lat/long) → render titik & bentuk di peta.
- [ ] Luas polygon dihitung otomatis (turf.js) dan ditampilkan (m² & ha).
- [ ] Tiap peta ter-link ke satu proyek; bisa ada beberapa layer/versi per proyek.
- [ ] Import **DXF** ditandai sebagai enhancement (lihat §10 Open Questions) — v1 fokus CSV, DXF fase lanjutan.

### Feature 4: Arsip Dokumen
Penyimpanan dokumen per proyek dengan kategori & pencarian. Ini tulang punggung "buka arsip lama".

**Acceptance criteria:**
- [ ] Upload file (PDF, gambar, dokumen) ke proyek, disimpan di object storage (Cloudflare R2 / UploadThing).
- [ ] Kategori: Laporan, Berita Acara, Foto Lapangan, Sertifikat/Legalitas, Data Mentah, Lainnya.
- [ ] Metadata per dokumen: nama, kategori, tanggal, uploader, ukuran.
- [ ] Search & filter dokumen lintas proyek (by nama, kategori, klien, rentang tanggal).
- [ ] Preview PDF/gambar in-app; download file asli.

### Feature 5: Keuangan Ringan
Catat nilai proyek & status pembayaran. Bukan invoicing penuh.

**Acceptance criteria:**
- [ ] Field per proyek: nilai proyek (IDR), status bayar (`Belum` / `Sebagian` / `Lunas`), catatan pembayaran.
- [ ] Ringkasan di dashboard owner: total nilai proyek aktif, total belum terbayar.
- [ ] Hanya Owner/Admin yang lihat & edit data keuangan. Surveyor tidak. Client lihat nilai & status bayar proyeknya sendiri (read-only).

### Feature 6: Portal Klien
Tampilan read-only untuk klien atas proyek miliknya.

**Acceptance criteria:**
- [ ] Klien login → lihat daftar proyeknya + status terkini.
- [ ] Detail proyek: peta hasil ukur, arsip dokumen (yang di-share ke klien), luas, nilai & status bayar.
- [ ] Client TIDAK bisa melihat proyek klien lain (row-level scoping wajib diuji).
- [ ] Dokumen bisa ditandai internal vs shared-to-client; hanya yang shared muncul di portal.

### Feature 7: Dashboard Ringkasan
Landing setelah login, disesuaikan per role.

**Acceptance criteria:**
- [ ] Owner: jumlah proyek per status, nilai proyek aktif, belum terbayar, proyek terbaru.
- [ ] Surveyor: proyek yang di-assign, yang butuh tindakan.
- [ ] Client: ringkasan proyeknya.

### Feature 8: Timeline Fase Proyek
Fase pekerjaan dinamis per proyek (nama, urutan, bobot, penanggung jawab, target) yang menghasilkan persen progres turunan — melengkapi status pipeline (Feature 2) yang cuma menunjukkan tahap kasar, bukan seberapa jauh. Terlihat read-only oleh klien di portal. Spec: `docs/superpowers/specs/2026-07-14-timeline-fase-proyek-design.md`.

**Acceptance criteria:**
- [x] Admin bisa tambah/edit/hapus/susun-ulang fase per proyek: nama, catatan internal, bobot, penanggung jawab (surveyor), target tanggal.
- [x] Admin atau surveyor yang ber-akses ke proyek bisa mengubah status fase (`Belum Mulai` / `Berjalan` / `Selesai`) dan catatannya — surveyor TIDAK bisa mengubah rencana (susun ulang, bobot, hapus).
- [x] Persen progres proyek adalah kolom TURUNAN (bobot fase `Selesai` ÷ total bobot), bukan isian manual. Proyek tanpa fase menampilkan empty state, BUKAN "0%".
- [x] Fase dengan target tanggal yang sudah lewat dan belum selesai ditandai "Telat".
- [x] Klien melihat timeline read-only di portal: nama fase, status, target, penanda telat, persen progres — TANPA catatan internal, bobot, atau nama penanggung jawab (dipangkas di level query, bukan di render).
- [x] Surveyor yang di-assign ke sebuah fase (bukan hanya `assignedSurveyorId` di level proyek) mendapat akses ke proyek itu.

### Feature 9: Inventaris Alat
CRUD alat ukur (total station, GPS RTK, drone, waterpass, theodolite, dst.) dengan pinjam/kembalikan per proyek — satu baris data = satu unit fisik, bukan stok. Status pakai dan durasi adalah turunan, bukan isian manual. Spec: `docs/superpowers/specs/2026-07-14-inventaris-alat-design.md`.

**Acceptance criteria:**
- [x] Admin bisa tambah/edit/arsipkan alat: nama, kategori, nomor seri, kondisi (tersedia/perawatan/rusak/pensiun), tanggal & harga beli, catatan. Alat tidak pernah dihapus permanen, hanya diarsipkan.
- [x] Admin atau surveyor ber-akses ke proyek bisa mencatat sesi pinjam (menempel ke satu proyek) dan mengembalikan alat. Surveyor mencatat sesi atas nama dirinya sendiri — server memaksa ini, bukan hanya form yang tidak menawarkannya.
- [x] Satu alat hanya bisa dipegang satu orang dalam satu waktu, ditegakkan oleh partial unique index di database (bukan hanya pengecekan aplikasi) — permintaan pinjam yang bentrok ditolak dengan pesan yang menyebut pemegangnya.
- [x] Alat yang berkondisi bukan "tersedia", atau sudah diarsipkan, tidak bisa dipinjam.
- [x] Status pakai ("Tersedia" / "Dipakai") dan durasi pakai adalah kolom TURUNAN dari sesi (`endedAt IS NULL` = dipakai; durasi = selisih waktu), bukan isian manual — mengoreksi jam mulai tidak meninggalkan durasi lama yang sudah jadi bohong.
- [x] Harga beli & tanggal beli hanya terlihat oleh admin, dipangkas di level query untuk surveyor (bentuk hasil query, bukan disembunyikan di UI).
- [x] Klien tidak punya akses apa pun ke modul ini — tidak ada rute di `/portal`, tidak ada query inventaris dipanggil dari sana.

---

## 4. Tech Stack

> **Vorca canonical stack — WAJIB.** Sumber: `docs/vorca-default-stack.md`. AI agent: gunakan persis ini kecuali di-override eksplisit.

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js (latest, App Router, Server Components default) | |
| Language | TypeScript (strict) | |
| Styling | Tailwind CSS + shadcn/ui | themed via CSS variables |
| ORM | **Drizzle ORM** | |
| Database | PostgreSQL — local dev: local Postgres · prod: **Neon** | swap `DATABASE_URL` per env |
| Auth | **Better Auth** | 3 role: owner/admin, surveyor, client |
| Validation / Forms | Zod + React Hook Form (`@hookform/resolvers`) | |
| Server actions | next-safe-action | |
| Env validation | `@t3-oss/env-nextjs` | |
| Lint + format | Biome | |
| Icons | Lucide | |
| Package manager | pnpm | |
| Deployment | Vercel | |
| Peta | **Leaflet** + react-leaflet, OSM + citra satelit gratis (Esri World Imagery) | |
| Geospasial (hitung luas) | **turf.js** (client-side) | |
| Penyimpanan GeoJSON | Kolom `jsonb` di Postgres/Neon | PostGIS = open decision, lihat §10 |
| File upload / storage | **Cloudflare R2** (S3-compatible) atau UploadThing | dokumen arsip |
| Data tables | TanStack Table (shadcn data table) | daftar proyek/dokumen |
| Parsing CSV | papaparse | import koordinat |
| Payments | — (tidak ada di v1, pembayaran manual) | |

---

## 5. Data Models

```typescript
// Better Auth mengelola tabel user/session; `role` ditambahkan sebagai field.
type UserRole = "owner" | "surveyor" | "client";

type User = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
};

type Client = {
  id: string;               // UUID
  name: string;
  type: "individual" | "company";
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  userId: string | null;    // link ke akun portal (role: client), nullable
  archivedAt: Date | null;  // soft delete
  createdAt: Date;
  updatedAt: Date;
};

type ProjectStatus =
  | "baru" | "dijadwalkan" | "data_diambil" | "diproses" | "selesai" | "dibatalkan";
type SurveyType =
  | "topografi" | "kavling" | "batas_tanah" | "luas_bangunan" | "lainnya";
type PaymentStatus = "belum" | "sebagian" | "lunas";

type Project = {
  id: string;
  title: string;
  clientId: string;              // FK Client
  surveyType: SurveyType;
  locationLabel: string | null;  // alamat/deskripsi lokasi lahan
  assignedSurveyorId: string | null; // FK User (role surveyor)
  status: ProjectStatus;
  orderDate: Date;
  description: string | null;
  // keuangan ringan
  projectValue: number | null;   // IDR
  paymentStatus: PaymentStatus;
  paymentNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProjectStatusLog = {
  id: string;
  projectId: string;
  fromStatus: ProjectStatus | null;
  toStatus: ProjectStatus;
  changedById: string;           // FK User
  createdAt: Date;
};

type MapLayer = {
  id: string;
  projectId: string;             // FK Project
  name: string;                  // mis. "Batas lahan v1"
  geojson: unknown;              // jsonb — FeatureCollection
  areaSqm: number | null;        // luas terhitung (m²), dari turf
  source: "manual" | "import_csv" | "import_dxf";
  rawFileUrl: string | null;     // file asli yang di-import (opsional)
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentCategory =
  | "laporan" | "berita_acara" | "foto_lapangan" | "sertifikat" | "data_mentah" | "lainnya";

type Document = {
  id: string;
  projectId: string;             // FK Project
  name: string;
  category: DocumentCategory;
  fileUrl: string;               // R2/UploadThing
  fileSize: number;
  mimeType: string;
  sharedWithClient: boolean;     // muncul di portal klien atau tidak
  uploadedById: string;
  createdAt: Date;
};
```

---

## 6. API / Server Actions

Semua mutasi via **next-safe-action** + Zod. Query via Server Components / server actions. Setiap action wajib cek role + scoping (client hanya data miliknya).

| Action | Tipe | Deskripsi | Auth |
|---|---|---|---|
| `createClient` / `updateClient` / `archiveClient` | server action | CRUD klien | owner/admin |
| `inviteClientUser` | server action | Kirim undangan akun portal (Better Auth) | owner/admin |
| `createProject` / `updateProject` | server action | CRUD proyek | owner/admin |
| `changeProjectStatus` | server action | Ubah status + tulis `ProjectStatusLog` | owner/admin, surveyor (assigned) |
| `assignSurveyor` | server action | Assign surveyor ke proyek | owner/admin |
| `saveMapLayer` | server action | Simpan GeoJSON + luas (manual draw) | owner/admin, surveyor |
| `importMapCsv` | server action | Parse CSV koordinat → GeoJSON → MapLayer | owner/admin, surveyor |
| `uploadDocument` | server action | Upload dokumen ke storage + metadata | owner/admin, surveyor |
| `toggleDocumentShare` | server action | Set `sharedWithClient` | owner/admin |
| `updatePayment` | server action | Set nilai proyek & status bayar | owner/admin |
| Portal queries | RSC | List/detail proyek untuk klien (scoped) | client |

---

## 7. Project Structure

```text
app/
  (dashboard)/            # area staf (owner/surveyor)
    clients/
    projects/
      [id]/               # detail: overview, map, documents, finance tabs
    page.tsx              # dashboard ringkasan
  (portal)/               # area klien
    projects/
  api/
lib/
  db/
    index.ts              # Drizzle client
    schema.ts             # semua tabel
  auth.ts                 # Better Auth config + roles
  actions/                # next-safe-action actions
  geo/                    # turf helpers, csv → geojson parser
components/
  ui/                     # shadcn/ui
  map/                    # Leaflet wrapper (client component)
  documents/
drizzle/
  migrations/
```

---

## 8. Environment Variables

```env
# Database (Drizzle → local Postgres dev, Neon prod)
DATABASE_URL=

# Auth (Better Auth)
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

# App
NEXT_PUBLIC_APP_URL=

# File storage (Cloudflare R2 / S3-compatible)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Email undangan portal klien (Resend) — jika dipakai
RESEND_API_KEY=
```

---

## 9. Success Metrics
> Belum ada baseline angka dari studio. Isi setelah dipakai; placeholder arah:
- Waktu menemukan dokumen arsip proyek lama < 30 detik.
- % proyek dengan peta hasil ukur ter-upload di sistem (target: mendekati 100%).
- Berkurangnya chat manual "gimana progress?" (kualitatif, feedback klien portal).

---

## 10. Open Questions
- **Penyimpanan geospasial:** v1 pakai GeoJSON di kolom `jsonb` + turf.js (client-side area calc) — cukup untuk display & arsip. Upgrade ke **PostGIS** (Neon support extension) hanya jika nanti butuh query spasial (mis. cari lahan dalam radius, luas geodesik akurat di DB). **Default: jsonb.**
- **Import DXF:** parsing DXF dari total station lebih kompleks dari CSV. v1 fokus **CSV koordinat**; DXF jadi enhancement fase lanjutan (butuh lib parsing DXF → GeoJSON, konfirmasi format alat yang dipakai studio).
- **Sistem koordinat:** data lapangan sering UTM (easting/northing zona 48–54S untuk Indonesia), bukan lat/long. Perlu konfirmasi apakah import harus reproyeksi UTM→WGS84 (butuh proj4js) atau data sudah lat/long.
- **Storage pilihan:** Cloudflare R2 (lebih murah, S3 API) vs UploadThing (lebih cepat setup). Default R2; boleh UploadThing kalau mau cepat.
- **Undangan akun klien:** apakah semua klien dapat portal, atau opsional per klien? Asumsi v1: opsional (owner undang manual per klien).
