# Sidebar hover-reveal + tombol pin

**Tanggal:** 2026-07-28
**Status:** disetujui (menunggu review spec)

## Ringkasan

Sidebar staf (`/dashboard`) sekarang punya dua lebar yang di-toggle **manual**
lewat tombol: rail `4.5rem` dan lebar `16rem`. Spec ini mengubah pemicunya jadi
**hover**: sidebar diam sebagai rail ikon, dan melebar jadi overlay saat kursor
masuk — **tanpa menggeser kolom konten**. Tombol yang ada berubah peran jadi
**pin**: mengunci sidebar tetap lebar dan mematikan hover, yaitu perilaku lama.

Perubahan murni di **layer presentasi** sidebar desktop. Tidak ada perubahan
skema DB, server action, RBAC, maupun `nav-config.ts`. Laci mobile
(`mobile-nav.tsx`) tidak tersentuh.

## Konteks saat ini

`app/dashboard/layout.tsx` membaca cookie `pkp_sidebar_collapsed` di server
(`layout.tsx:34`) dan menurunkannya sebagai `defaultCollapsed` ke
`DashboardSidebar`. Pembacaan di server ini disengaja: dengan localStorage
sidebar akan tergambar lebar dulu lalu menciut setelah hidrasi — kedip yang
terlihat tiap muat halaman. **Sifat ini harus dipertahankan.**

`components/dashboard/sidebar.tsx` memegang `useState(defaultCollapsed)`,
menulis cookie di `toggle()`, dan memakai `collapsed` untuk tiga hal:

- lebar `<aside>` sendiri — `collapsed ? "w-[4.5rem]" : "w-64"` (`sidebar.tsx:55`)
- menyembunyikan logo + wordmark di header
- diteruskan sebagai prop ke `SidebarNav` dan `UserMenu`

`components/dashboard/sidebar-nav.tsx` memakai `collapsed` untuk menyembunyikan
label tautan (`sidebar-nav.tsx:71`) dan membungkus tiap tautan dengan `Tooltip`
berisi label (`sidebar-nav.tsx:77`). Komponen ini **dipakai bersama** oleh laci
mobile dengan `collapsed=false`.

## Arsitektur

### Dua mode, satu sumber kebenaran

State yang dipersist berubah dari "menciut" jadi "**dipin**":

| Mode | Lebar rail | Perilaku hover | Kolom konten |
|---|---|---|---|
| Tidak dipin (**default**) | `4.5rem` | melebar ke `16rem` sebagai overlay | tetap di tempat |
| Dipin | `16rem` | mati | bergeser ke kanan |

`collapsed` yang diteruskan ke `SidebarNav`/`UserMenu` jadi turunan, bukan
state tersimpan:

```
collapsed = !pinned && !hovered
```

Artinya kedua komponen anak **tidak perlu diubah** — kontraknya tetap sama.

### Cookie baru, bukan pakai ulang yang lama

Cookie lama `pkp_sidebar_collapsed` bernilai `"1"` untuk **menciut**. Kalau
namanya dipakai ulang untuk `pinned`, setiap pengguna yang sebelumnya memilih
rail akan mendadak mendapat sidebar terkunci lebar — persis kebalikan
pilihannya.

Karena itu: konstanta baru `SIDEBAR_PIN_COOKIE = "pkp_sidebar_pinned"` di
`nav-config.ts`. Cookie lama tidak dibaca lagi dan dibiarkan kedaluwarsa
sendiri; tidak ada migrasi. `SIDEBAR_COOKIE` yang lama dihapus dari
`nav-config.ts` supaya tidak ada dua konstanta yang mirip.

`layout.tsx` membaca cookie baru dan meneruskannya sebagai `defaultPinned` —
alasan yang sama dengan sebelumnya: lebar sudah benar pada cat pertama.

### Overlay tanpa menggeser konten

Ini bagian yang paling menentukan. `<aside>` adalah flex item di dalam
`<div className="flex min-h-svh">`, jadi mengubah lebarnya **selalu** menggeser
kolom konten di sebelahnya. Maka lebar `<aside>` tidak boleh ikut berubah saat
hover.

Pemisahan tanggung jawab jadi dua elemen:

- **`<aside>` = penahan ruang.** Lebarnya hanya bergantung pada `pinned`:
  `pinned ? "w-64" : "w-[4.5rem]"`. Tidak bereaksi terhadap hover.
- **Panel = yang terlihat.** Anak `absolute inset-y-0 left-0` dengan `z-30`,
  memegang seluruh isi sidebar (header, nav, blok pengguna) dan seluruh gaya
  visual (`bg-sidebar`, `border-r`, `GridTexture`). Lebarnya
  `collapsed ? "w-[4.5rem]" : "w-64"`.

Karena panel keluar dari alur layout, pelebarannya menimpa konten alih-alih
mendorongnya. Saat dipin, keduanya sama-sama `16rem` sehingga hasil akhirnya
identik dengan perilaku sekarang.

Yang pindah dari `<aside>` ke panel: `bg-sidebar`, `border-r`,
`text-sidebar-foreground`, dan transisi lebar. Yang tetap di `<aside>`:
`sticky top-0 h-svh`, `hidden md:flex`, `shrink-0`.

Saat melebar dalam mode hover, panel mendapat `shadow-lg` — tanpa itu ia
menyatu dengan konten di belakangnya dan batas overlay-nya tidak terbaca. Saat
dipin, shadow mati karena tidak ada yang ditimpa.

### Pemicu hover dan jalur keyboard

Handler dipasang di panel, bukan di `<aside>` — area hover harus sama persis
dengan area yang terlihat:

- `onPointerEnter` → buka setelah jeda **120ms**
- `onPointerLeave` → tutup setelah jeda **200ms**
- `onFocusCapture` → buka **seketika** (tanpa jeda)
- `onBlurCapture` → tutup seketika kalau fokus keluar dari panel

Jeda buka mencegah panel berkedip saat kursor cuma melintas menuju konten. Jeda
tutup yang lebih panjang memberi toleransi saat kursor keluar sedikit lalu
balik. Timer disimpan di `useRef` dan dibersihkan di `useEffect` cleanup.

Jalur fokus wajib ada: tanpa `onFocusCapture`, pengguna keyboard yang nge-Tab
ke tautan navigasi akan mendarat di elemen yang labelnya tersembunyi. Fokus
tidak diberi jeda karena Tab adalah aksi yang disengaja, bukan kebetulan.

`onFocusCapture`/`onBlurCapture` (fase capture) dipakai supaya event dari
tautan anak ikut tertangkap — `focus` tidak menggelembung.

### Penjagaan perangkat sentuh

Seluruh perilaku hover dijaga `window.matchMedia("(hover: hover)")`, dibaca
sekali di `useEffect` dan disimpan di state. Kalau `false`, handler pointer
tidak memasang apa-apa.

Tanpa penjagaan ini, di iPad (lebar `md`, tapi tanpa hover) `pointerenter`
tetap menyala saat tap dan panel nyangkut terbuka sampai tap di tempat lain.

**Konsekuensi yang diterima:** di perangkat sentuh `md`+, rail jadi
ikon-tanpa-label permanen sampai pengguna menekan tombol pin sekali; setelah
itu pilihannya tersimpan di cookie. Alternatifnya adalah deteksi sentuh yang
lebih pintar, yang dalam praktiknya sering salah tebak pada laptop layar
sentuh. Pin sekali dianggap harga yang wajar.

### Tooltip dimatikan di sidebar

`SidebarNav` mendapat prop baru `showTooltips` (default `true`). Sidebar
desktop meneruskan `false`.

Alasannya: tooltip menyala pada hover yang **sama persis** dengan yang
melebarkan panel, jadi label muncul dua kali — sekali di tooltip, sekali di
panel yang melebar — dan tooltip melayang di atas panel yang baru terbuka.

Default `true` dipertahankan supaya laci mobile tidak ikut berubah, meski di
sana `collapsed` selalu `false` sehingga cabang tooltip memang tidak pernah
jalan. Prop ini bukan penanda mati: ia menjaga `SidebarNav` tetap bisa dipakai
di konteks rail lain nanti tanpa perlu dibongkar.

### Tombol pin

Tetap di header panel, tetap `PanelLeftIcon`. Yang berubah hanya makna dan
labelnya:

- `aria-label`: `pinned ? "Lepas pin sidebar" : "Pin sidebar tetap terbuka"`
- `aria-pressed={pinned}` menggantikan `aria-expanded` — ini tombol dwi-keadaan
  sekarang, bukan pengungkap
- ikon dirotasi saat **tidak** dipin (kebalikan dari sekarang)

Saat tidak dipin, tombol hanya terlihat kalau panel sedang melebar — di rail
sempit ia berdesakan dengan ikon nav dan gampang tertekan tak sengaja.

**Kecuali saat hover tidak tersedia.** Di perangkat sentuh panel tidak pernah
melebar, jadi aturan di atas akan menyembunyikan tombol pin selamanya — dan pin
justru satu-satunya jalan keluar dari rail di sana. Maka syaratnya:

```
tombolPinTerlihat = !collapsed || !hoverTersedia
```

Saat `hover: none`, tombol tetap tergambar di rail sempit dalam keadaan ciut
(ikon saja, tanpa wordmark di sebelahnya).

## Berkas yang tersentuh

| Berkas | Perubahan |
|---|---|
| `components/dashboard/nav-config.ts` | Ganti `SIDEBAR_COOKIE` → `SIDEBAR_PIN_COOKIE` |
| `app/dashboard/layout.tsx` | Baca cookie baru, teruskan `defaultPinned` |
| `components/dashboard/sidebar.tsx` | Perombakan utama: state `pinned` + `hovered`, pemisahan aside/panel |
| `components/dashboard/sidebar-nav.tsx` | Prop `showTooltips` |
| `e2e/sidebar.spec.ts` | Baru |

## Verifikasi

Tidak ada infrastruktur test komponen di repo ini (`*.test.tsx` tidak ada);
yang tersedia Playwright di `e2e/`. Karena itu perilakunya diuji di sana.

`e2e/sidebar.spec.ts`, memakai `auth.setup.ts` yang sudah ada:

1. **Default rail** — sesi baru: panel selebar `4.5rem`, label tautan tidak
   terlihat.
2. **Hover melebarkan tanpa menggeser konten** — catat `x` dari kolom konten,
   hover panel, tunggu label terlihat, pastikan `x` kolom konten **tidak
   berubah**. Ini asersi inti seluruh spec.
3. **Pin bertahan setelah reload** — klik pin, `reload()`, panel tetap `16rem`
   dan kolom konten bergeser.
4. **Lepas pin** — klik lagi, balik ke rail.
5. **Jalur keyboard** — `Tab` sampai tautan nav pertama fokus, label harus
   terlihat.

Ditambah `pnpm lint` dan `pnpm typecheck`.

## Di luar cakupan

- Laci mobile (`mobile-nav.tsx`) — tidak berubah.
- Lebar sidebar yang bisa diseret pengguna.
- Menyimpan preferensi pin per-pengguna di DB — cookie sudah cukup, dan ini
  preferensi per-perangkat, bukan per-akun.
- Sidebar portal klien (`app/portal`) — tidak punya sidebar.
