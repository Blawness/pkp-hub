# Gallery/List toggle di Inventaris Alat

**Tanggal:** 2026-07-22
**Status:** disetujui (menunggu review spec)

## Ringkasan

Halaman Inventaris Alat (`/dashboard/equipment`) sekarang menampilkan daftar
alat sebagai **accordion per jenis**. Spec ini menambahkan **gallery view**
bergaya katalog e-commerce sebagai tampilan **default**, dengan toggle untuk
kembali ke list (accordion) view. Toggle bersifat **sesaat** — tidak dipersist.

Perubahan murni di **layer presentasi**: bentuk data `rows` yang dikirim RSC
(`EquipmentPage`) ke komponen klien **tidak berubah**. Tidak ada perubahan
skema DB, server action, atau auth/scoping.

## Konteks saat ini

`app/dashboard/equipment/page.tsx` (RSC) menyiapkan `rows:
EquipmentItemAccordionRow[]` lalu me-render `EquipmentItemAccordion`. Accordion
itu memegang:

- kotak **search** internal (state `query`) — memfilter per nama jenis / kode /
  no. seri
- state `expanded` (set id jenis yang terbuka)
- badan yang ke-expand: daftar **unit** + aksi (Pinjam / Kembali / Edit / Hapus)
  + tombol "Tambah unit"

Filter **kategori & status** terpisah di `EquipmentFilters` dan disimpan di URL
(`searchParams`), difilter di sisi server sebelum `rows` dibentuk. Filter ini
**tetap dipakai bersama** oleh kedua view — hanya search + layout yang jadi
state klien.

## Arsitektur

### Angkat search & view state ke satu wrapper klien

Ganti render `<EquipmentItemAccordion .../>` di `page.tsx` dengan wrapper klien
baru **`EquipmentCatalog`** yang memegang:

- `view: "gallery" | "list"` — default `"gallery"`, `useState` biasa (tidak
  dipersist ke URL maupun localStorage).
- `query: string` — kotak search **diangkat** dari accordion ke wrapper, supaya
  dipakai bersama kedua view.

Wrapper me-render:

- **Toolbar**: kotak search (`Input`) + segmented toggle 2 tombol ikon
  (`LayoutGridIcon` = gallery, `Rows3Icon` = list). Tombol aktif memakai
  `variant="default"`, non-aktif `variant="outline"` (atau `ghost`); tiap
  tombol punya `aria-label` ("Tampilan galeri" / "Tampilan daftar").
- **Filtering search** dilakukan sekali di wrapper (logika yang sekarang ada di
  accordion: cocokkan `name` / `unit.code` / `unit.serialNumber`), lalu `rows`
  terfilter dioper ke view yang aktif.
- **Empty-state** dipindah ke wrapper (dipakai bersama kedua view) — ditampilkan
  saat hasil filter kosong. `EquipmentPage` tetap mengirim prop `emptyMessage`
  ke `EquipmentCatalog`.

### Ekstrak daftar unit → `EquipmentUnitList`

Baris-baris unit + aksi + tombol "Tambah unit" saat ini nempel di badan
accordion. Ekstrak jadi komponen presentational **`EquipmentUnitList`** agar
dipakai dua tempat tanpa duplikasi:

- badan accordion yang ke-expand (list view) — perilaku **tetap sama persis**
- di dalam dialog detail (gallery view)

Props `EquipmentUnitList`:

```ts
{
  item: { id: string; name: string };   // untuk label aksi & "Tambah unit"
  units: EquipmentUnitRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
}
```

Isi yang dipindahkan apa adanya dari accordion baris ~180–353: link overlay ke
`/dashboard/equipment/unit/[id]`, badge kondisi/terpinjam, quick-action
(ReturnButton / BorrowDialog / EquipmentFormDialog / ArchiveEquipmentButton),
dan tombol "+ Tambah unit" (admin). Tipe `EquipmentUnitRow` &
`EquipmentItemAccordionRow` tetap diekspor dari `equipment-item-accordion.tsx`
(atau dipindah ke `equipment-unit-list.tsx` dan di-re-export) — page.tsx
meng-import `EquipmentItemAccordionRow`, jadi jaga jalur importnya tetap valid.

### Gallery view → `EquipmentGallery`

Grid responsif katalog:

- Grid: `grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4`.
- **Card** (per jenis alat), seluruhnya satu tombol pembuka dialog:
  - area foto atas: `aspect-[4/3]`, `object-cover`, fallback `ImageIcon`
    ter-center (samakan pola `<img>` + `biome-ignore
    lint/performance/noImgElement` yang sudah ada di accordion).
  - nama (`font-medium truncate`) + kategori (`text-xs text-muted-foreground`,
    pakai `equipmentCategoryLabel`).
  - ringkasan stok ringkas: `{total} unit · {tersedia} tersedia` + segmen
    kondisional (dipinjam/perawatan/rusak) meniru ringkasan accordion.
  - satu `Badge` status ringkas (mis. "Tersedia" bila `tersedia > 0`, else
    "Habis"/kondisi dominan) — dijaga sederhana, konsisten dengan
    `conditionVariant`.
- Klik card → **dialog detail** (`components/ui/dialog.tsx`, Base UI —
  mendukung nested dialog sehingga Borrow/Edit di dalamnya tetap berfungsi):
  - `DialogHeader`: nama jenis + kategori (+ foto bila ada).
  - body: `EquipmentUnitList` (unit + aksi + "Tambah unit").
  - aksi admin tingkat-jenis (Edit jenis via `EquipmentItemFormDialog`, Arsip
    via `ArchiveEquipmentItemButton`) diletakkan di header dialog — bukan di
    permukaan card, agar card tetap bersih.

State "dialog jenis mana yang terbuka" dipegang lokal di `EquipmentGallery`
(mis. `openId: string | null`).

### Accordion view → `EquipmentItemAccordion` (diubah)

- **Buang** `Input` search internal + state `query` + `useMemo` filter (pindah
  ke `EquipmentCatalog`). Terima `items` yang **sudah terfilter**.
- **Buang** penanganan `emptyMessage` internal (pindah ke wrapper). Prop
  `emptyMessage` bisa dihapus dari accordion.
- Badan yang ke-expand memakai `<EquipmentUnitList .../>` menggantikan blok baris
  unit inline.
- State `expanded` (buka/tutup) **tetap** di accordion.

## Aliran data

```
EquipmentPage (RSC)
  └─ rows, isAdmin, projectOptions, surveyors, emptyMessage
      └─ EquipmentCatalog (client)  ── view state, query state, filter search
          ├─ Toolbar (search + toggle)
          ├─ view==="gallery" → EquipmentGallery(filtered)
          │     └─ Dialog → EquipmentUnitList
          └─ view==="list"    → EquipmentItemAccordion(filtered)
                └─ (expanded) → EquipmentUnitList
```

## File yang berubah

| File | Aksi |
|------|------|
| `components/equipment/equipment-catalog.tsx` | **baru** — wrapper toolbar + switch view + filter search + empty-state |
| `components/equipment/equipment-gallery.tsx` | **baru** — grid card + dialog detail |
| `components/equipment/equipment-unit-list.tsx` | **baru** — ekstrak baris unit + aksi + "Tambah unit" |
| `components/equipment/equipment-item-accordion.tsx` | **ubah** — buang search/empty internal, pakai `EquipmentUnitList` |
| `app/dashboard/equipment/page.tsx` | **ubah** — `EquipmentItemAccordion` → `EquipmentCatalog` |

## Yang TIDAK berubah (batas ruang lingkup)

- Bentuk `rows` / payload server, `listEquipmentItemsForUser`, dan pemangkasan
  field admin-only (harga/tanggal beli) — semua tetap.
- `EquipmentFilters` (kategori/status via URL) dan `EquipmentSummary`.
- Skema DB, server action, auth-guards, RBAC.
- Perilaku list/accordion view (identik dengan sekarang, hanya sumber search &
  baris unit yang direfaktor).

## Pertimbangan / risiko

- **Nested dialog**: BorrowDialog / EquipmentFormDialog dibuka dari dalam dialog
  detail gallery. Base UI mendukung ini (portaled), tapi perlu diverifikasi saat
  implementasi bahwa fokus & penutupan berlapis bekerja (buka Pinjam dari dalam
  dialog jenis, submit, kedua dialog menutup benar).
- **Aksesibilitas toggle**: dua tombol butuh `aria-label` + `aria-pressed`
  supaya screen reader tahu view aktif.

## Testing

Fitur ini murni presentasi klien; tidak ada logika baru yang bisa di-unit-test
di `*-logic.ts`. Verifikasi manual:

1. `pnpm typecheck` & `pnpm lint` bersih.
2. Halaman default membuka **gallery view**; toggle ke list dan balik bekerja.
3. Search memfilter di **kedua** view; filter kategori/status (URL) tetap jalan
   bersamaan.
4. Gallery: klik card → dialog; Pinjam / Kembali / Edit unit / Tambah unit /
   Edit jenis / Arsip jenis semuanya berfungsi dari dalam dialog (admin &
   surveyor sesuai hak).
5. List view berperilaku identik dengan sebelum refaktor.
6. Empty-state muncul benar saat search/filter tidak menghasilkan apa-apa, di
   kedua view.
