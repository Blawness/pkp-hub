# Tracking pipeline sosmed di PKP Hub — design

Tanggal: 2026-11-10 · Status: implemented

## Masalah

Pipeline sosmed (`_shared/sosmed-pipeline/komentar` + `PKP/04 Marketing/Sosmed Agent`)
menyimpan state di file lokal: `queue.json`, `log.jsonl`, dan folder `posts/`.
Dari Hub, tidak ada cara menjawab "post apa yang sudah tayang bulan ini" atau
"komentar reachout ke akun mana yang gagal" tanpa membuka laptop yang memegang
folder itu. Hub hanya punya data proyek survey.

## Keputusan

**Push, bukan pull.** Hub berjalan di Vercel dan tidak bisa membaca folder lokal
studio. Pipeline mengirim datanya ke Hub lewat satu endpoint mesin; Hub menyimpan
salinan yang bisa dibaca dashboard. Pipeline tetap sumber kebenaran — Hub adalah
cermin yang di-upsert berulang kali.

### Tabel

| Tabel | Isi | Kunci idempoten |
|---|---|---|
| `social_post` | satu post IG: slug folder, judul, pilar, status draft.json, versi, jadwal, tanggal tayang, permalink, caption, jumlah slide | `(brand, external_id)` |
| `social_comment` | satu komentar reachout: mode `balas`/`sapa`, class, status antrean, target, post, penulis sumber, teks sumber, draft, alasan skip/failed, waktu | `(brand, external_id)` |
| `social_sync_run` | jejak tiap panggilan sync: brand, handle, status, jumlah baris, error | — |

Enum mengikuti domain yang sudah ada: `social_post_status` = enum `status` di
`Sosmed Agent/schema/draft.schema.json`; `social_comment_status` = `STATUSES`
engine komentar (`drafted`/`approved`/`posted`/`skipped`/`failed`) supaya tidak
ada pemetaan status yang bisa melenceng di dua tempat.

### Endpoint

`POST /api/sosmed/sync` — token mesin `SOSMED_SYNC_TOKEN` (Bearer,
`timingSafeEqual`). Token kosong = route menolak semua panggilan (fail-closed).
Payload divalidasi Zod (`lib/sosmed/sync-schemas.ts`), lalu di-upsert dalam satu
transaksi (`lib/sosmed/sync-logic.ts`). Setiap panggilan dicatat di
`social_sync_run`, termasuk yang gagal — "data tidak muncul" harus bisa
dibedakan dari "push tidak pernah sampai".

Bukan server action: pemanggilnya proses CLI tanpa sesi user.

### UI

`/dashboard/sosmed` — dua tab (Postingan, Komentar) + empat kartu ringkas
(tayang, komentar 7 hari, menunggu eksekusi, gagal). Nav "Sosmed" muncul lewat
permission `social.read`; hanya admin/superuser yang memilikinya (resource
table-less `social`, gerbang `assertCan` di setiap fungsi baca).

`social_post.caption` disimpan sebagai teks, bukan referensi file, supaya Hub
bisa menunjukkan isi yang tayang tanpa akses storage lokal.

Setelah migrasi, jalankan `pnpm db:sync-roles` (dev) atau
`pnpm db:sync-roles:prod` agar grant `social.read` masuk ke role admin/superuser
yang sudah ada — permission baru tidak otomatis menempel ke baris role lama.

### Sisi pipeline

`cli.mjs hub-sync --brand <pkp|trihuni>` mengirim seluruh `posts/*` (status dari
`draft.json`, fallback `drafted`, override lewat `posts/_status.json`) dan seluruh
`queue.json`. Token dibaca dari env `PKP_HUB_TOKEN`, URL dari `PKP_HUB_URL`;
tidak pernah disimpan di repo.

## Yang sengaja TIDAK dilakukan

- **Tidak ada tarik data dari Instagram.** Metadata post dari IG (likes, reach)
  butuh Graph API; di luar cakupan sync file.
- **Tidak ada penulisan dari UI.** Dashboard read-only; satu-satunya jalur tulis
  adalah endpoint mesin.
- **Tidak ada scoping per klien/surveyor.** Data marketing, bukan proyek.
