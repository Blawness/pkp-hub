# Sidebar Hover-Reveal + Tombol Pin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidebar staf diam sebagai rail ikon `4.5rem` dan melebar jadi overlay `16rem` saat di-hover tanpa menggeser kolom konten, dengan tombol lama berubah peran jadi pin yang mengunci sidebar tetap lebar.

**Architecture:** `<aside>` dipecah jadi dua tanggung jawab — elemen luar jadi penahan ruang yang lebarnya hanya bergantung pada `pinned`, dan panel `absolute` di dalamnya yang memegang seluruh visual dan melebar menimpa konten. Lebar yang dipakai komponen anak diturunkan dari `collapsed = !pinned && !hovered`, jadi `SidebarNav` dan `UserMenu` tidak perlu tahu apa pun soal hover. Preferensi pin disimpan di cookie baru dan dibaca di server supaya lebar sudah benar pada cat pertama.

**Tech Stack:** Next.js App Router (RSC + `"use client"`), Tailwind v4, Playwright.

## Global Constraints

- Spec acuan: `docs/superpowers/specs/2026-07-28-sidebar-hover-reveal-design.md`. Ikuti persis.
- Cookie baru bernama `pkp_sidebar_pinned`, nilai `"1"` = dipin. Cookie lama `pkp_sidebar_collapsed` **tidak boleh dipakai ulang** — nilainya berarti kebalikan.
- Konstanta nama cookie **wajib** tinggal di `nav-config.ts` (modul netral), bukan di `sidebar.tsx` yang ber-`"use client"`. Alasannya ada di komentar file itu: konstanta yang diekspor modul klien lalu diimpor Server Component tidak sampai sebagai nilai aslinya, dan `cookies().get()` diam-diam selalu mengembalikan `undefined`.
- Lebar rail `4.5rem` (72px) dan lebar penuh `16rem` (256px) — angka yang sudah dipakai, jangan diubah.
- Bahasa UI dan komentar kode: **Indonesia**.
- Laci mobile (`components/dashboard/mobile-nav.tsx`) tidak boleh tersentuh.
- Lint/format: `pnpm lint:fix`. Typecheck: `pnpm typecheck`. E2E: `pnpm e2e` (butuh `pnpm dev` sudah jalan di :3000).

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `components/dashboard/nav-config.ts` (modify) | Ganti konstanta `SIDEBAR_COOKIE` → `SIDEBAR_PIN_COOKIE`. |
| `app/dashboard/layout.tsx` (modify) | Baca cookie pin di server, teruskan `defaultPinned`; tandai kolom konten dengan `data-slot`. |
| `components/dashboard/sidebar.tsx` (modify) | Perombakan utama: state `pinned` + `hovered`, pemisahan aside/panel, handler hover/fokus, tombol pin. |
| `components/dashboard/sidebar-nav.tsx` (modify) | Prop `showTooltips`; `aria-label` saat rail. |
| `e2e/sidebar.spec.ts` (create) | Seluruh verifikasi perilaku. |

**Catatan alat verifikasi:** repo ini tidak punya test komponen (`*.test.tsx` nihil) — hanya Vitest untuk logic dan Playwright untuk UI. Karena seluruh spec ini murni perilaku UI, TDD-nya dijalankan di level E2E: tulis spec Playwright yang gagal dulu, baru implementasi.

---

## Task 1: Semantik pin + pemisahan aside/panel

Deliverable: sidebar default rail, tombol berubah jadi pin yang mengunci lebar dan bertahan setelah reload. Struktur aside/panel sudah final sehingga selector E2E tidak perlu berubah lagi di task berikutnya.

**Files:**
- Modify: `components/dashboard/nav-config.ts:13-22`
- Modify: `app/dashboard/layout.tsx:6`, `:26-34`, `:48`, `:53`
- Modify: `components/dashboard/sidebar.tsx` (seluruh komponen)
- Test: `e2e/sidebar.spec.ts` (create)

**Interfaces:**
- Produces: `SIDEBAR_PIN_COOKIE: string` dari `@/components/dashboard/nav-config` — dipakai `layout.tsx` (baca) dan `sidebar.tsx` (tulis).
- Produces: `DashboardSidebar({ user, defaultPinned }: { user: SessionUser; defaultPinned: boolean })` — prop `defaultCollapsed` **dihapus**.
- Produces: atribut DOM yang jadi kontrak selector E2E untuk semua task berikutnya:
  - `[data-slot="sidebar"]` — `<aside>` penahan ruang (tetap, sudah ada; dipakai `app/globals.css:183`)
  - `[data-slot="sidebar-panel"]` — panel absolute yang terlihat
  - `[data-slot="content-column"]` — kolom konten di `layout.tsx`

- [ ] **Step 1: Tulis E2E yang gagal**

Buat `e2e/sidebar.spec.ts`:

```ts
import { expect, type Page, test } from "@playwright/test";

/**
 * E2E sidebar hover-reveal + pin (spec 2026-07-28).
 *
 * Kenapa E2E dan bukan test komponen: repo ini tidak punya infrastruktur
 * test komponen sama sekali, dan klaim inti spec ini — "panel melebar TANPA
 * menggeser kolom konten" — adalah pernyataan soal layout terpakai yang
 * hanya bisa dibuktikan browser sungguhan.
 *
 * Semua test memakai storageState admin; sidebar tidak bergantung peran
 * (isi tautannya iya, lebarnya tidak).
 */

const RAIL_PX = 72; // 4.5rem
const WIDE_PX = 256; // 16rem

const PANEL = (page: Page) => page.locator('[data-slot="sidebar-panel"]');
const CONTENT = (page: Page) => page.locator('[data-slot="content-column"]');
const PIN_BUTTON = (page: Page) => page.getByRole("button", { name: "Pin sidebar tetap terbuka" });
const UNPIN_BUTTON = (page: Page) => page.getByRole("button", { name: "Lepas pin sidebar" });

/** Lebar terpakai panel, menunggu transisi CSS selesai (auto-retry expect). */
async function expectPanelWidth(page: Page, px: number) {
  await expect(PANEL(page)).toHaveCSS("width", `${px}px`);
}

/** Absis kiri kolom konten — inilah yang TIDAK boleh bergerak saat hover. */
async function contentLeft(page: Page): Promise<number> {
  const box = await CONTENT(page).boundingBox();
  if (!box) throw new Error("kolom konten tidak terlihat");
  return box.x;
}

test.describe("sidebar staf", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("diam sebagai rail ikon tanpa wordmark", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);
    // Wordmark hanya dirender saat melebar, jadi ia penanda keadaan yang
    // lebih jujur daripada lebar semata.
    await expect(PANEL(page).getByText("PKP Hub")).toBeHidden();
  });

  test("pin mengunci lebar dan bertahan setelah reload", async ({ page }) => {
    await page.goto("/dashboard");
    // Hover dulu: setelah Task 3 tombol pin memang hanya muncul saat panel
    // melebar. Di Task 1 hover belum berefek apa-apa dan langkah ini tidak
    // merugikan — ditulis sekarang supaya test tidak perlu diubah nanti.
    await PANEL(page).hover();
    await PIN_BUTTON(page).click();

    await expectPanelWidth(page, WIDE_PX);
    // Saat dipin panel MENDORONG konten — ini beda mendasar dengan hover.
    expect(await contentLeft(page)).toBeCloseTo(WIDE_PX, 0);

    await page.reload();
    await expectPanelWidth(page, WIDE_PX);
    expect(await contentLeft(page)).toBeCloseTo(WIDE_PX, 0);
  });

  test("lepas pin mengembalikan ke rail", async ({ page }) => {
    await page.goto("/dashboard");
    await PANEL(page).hover();
    await PIN_BUTTON(page).click();
    await expectPanelWidth(page, WIDE_PX);

    await UNPIN_BUTTON(page).click();
    // Kursor masih di atas panel sehingga ia tetap terbuka; yang membuktikan
    // pin sudah lepas adalah kolom konten yang balik merapat ke rail.
    await expect
      .poll(async () => contentLeft(page), { message: "konten balik ke tepi rail" })
      .toBeLessThanOrEqual(RAIL_PX + 1);
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

Pastikan `pnpm dev` sudah jalan di :3000, lalu:

```bash
pnpm e2e e2e/sidebar.spec.ts
```

Harapan: **FAIL**. Ketiganya gagal di locator `[data-slot="sidebar-panel"]` yang belum ada (timeout 30s).

- [ ] **Step 3: Ganti konstanta cookie**

Di `components/dashboard/nav-config.ts`, ganti blok komentar + konstanta di baris 12-22 dengan:

```ts
/**
 * Nama cookie penyimpan preferensi PIN sidebar (`"1"` = dipin).
 *
 * Tinggal di modul netral ini — BUKAN di `sidebar.tsx` — karena file itu
 * ber-"use client". Konstanta yang diekspor dari modul klien lalu diimpor oleh
 * Server Component tidak sampai sebagai nilai aslinya; yang diterima server
 * adalah referensi klien, sehingga `cookies().get(...)` mencari nama yang salah
 * dan selalu mengembalikan undefined — sidebar pun lupa pilihan penggunanya di
 * setiap muat ulang, tanpa satu pun error yang muncul.
 *
 * Namanya sengaja BEDA dari `pkp_sidebar_collapsed` yang lama: nilai lama
 * berarti "menciut", kebalikan dari "dipin". Memakai ulang namanya akan
 * membuat setiap pengguna yang dulu memilih rail mendadak mendapat sidebar
 * terkunci lebar. Cookie lama dibiarkan kedaluwarsa sendiri.
 */
export const SIDEBAR_PIN_COOKIE = "pkp_sidebar_pinned";
```

- [ ] **Step 4: Sambungkan di layout server**

Di `app/dashboard/layout.tsx`:

Baris 6, ganti import:

```ts
import { SIDEBAR_PIN_COOKIE } from "@/components/dashboard/nav-config";
```

Baris 26-28, ganti paragraf terakhir komentar JSDoc `DashboardLayout`:

```
 * Preferensi pin sidebar dibaca di sini, di server, supaya panel sudah
 * tergambar dengan lebar yang benar pada cat pertama (lihat `sidebar.tsx`).
```

Baris 34, ganti pembacaan cookie:

```ts
  const pinned = cookieStore.get(SIDEBAR_PIN_COOKIE)?.value === "1";
```

Baris 48, ganti prop:

```tsx
          <DashboardSidebar user={user} defaultPinned={pinned} />
```

Baris 53, tambah `data-slot` pada kolom konten (dipakai E2E untuk membuktikan konten tidak bergeser):

```tsx
          <div data-slot="content-column" className="flex min-w-0 flex-1 flex-col">
```

- [ ] **Step 5: Rombak sidebar jadi aside + panel**

Ganti seluruh isi `components/dashboard/sidebar.tsx`:

```tsx
"use client";

import { PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { GridTexture } from "@/components/brand/grid-texture";
import { buildLinks, SIDEBAR_PIN_COOKIE } from "@/components/dashboard/nav-config";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { usePermissions } from "@/components/rbac/permissions-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth-guards";
import { cn } from "@/lib/utils";

/**
 * Sidebar staf (desktop). Laci mobile hidup di `mobile-nav.tsx`.
 *
 * Preferensi pin disimpan di cookie, bukan localStorage, supaya layout di
 * server sudah tahu lebarnya pada render pertama. Dengan localStorage sidebar
 * akan selalu tergambar lebar dulu lalu menciut setelah hidrasi — kedip yang
 * terlihat setiap kali memuat halaman.
 *
 * BENTUK: `<aside>` bukan yang terlihat — ia cuma PENAHAN RUANG, dan lebarnya
 * hanya bergantung pada `pinned`. Yang terlihat adalah panel `absolute` di
 * dalamnya. Pemisahan ini yang memungkinkan panel melebar MENIMPA konten alih-
 * alih mendorongnya: `<aside>` adalah flex item, jadi mengubah lebarnya selalu
 * menggeser kolom di sebelahnya.
 */
export function DashboardSidebar({
  user,
  defaultPinned,
}: {
  user: SessionUser;
  defaultPinned: boolean;
}) {
  const [pinned, setPinned] = useState(defaultPinned);
  const { can } = usePermissions();
  const links = buildLinks(can);

  const collapsed = !pinned;

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    // max-age 1 tahun; preferensi tata letak, bukan data sensitif.
    // biome-ignore lint/suspicious/noDocumentCookie: CookieStore API belum ada di Safari, dan tidak sepadan untuk satu penulisan cookie sesederhana ini.
    document.cookie = `${SIDEBAR_PIN_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "relative hidden shrink-0 md:block",
        // Sticky setinggi viewport, bukan setinggi dokumen: tanpa ini aside
        // ikut memanjang mengikuti isi halaman, dan blok pengguna di kakinya
        // terdorong jauh ke bawah lipatan — tak terlihat sampai halaman
        // digulir habis.
        "sticky top-0 h-svh",
        "transition-[width] duration-(--motion-base) ease-(--ease-out-expo)",
        pinned ? "w-64" : "w-[4.5rem]",
      )}
    >
      <div
        data-slot="sidebar-panel"
        data-collapsed={collapsed}
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden",
          "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "transition-[width] duration-(--motion-base) ease-(--ease-out-expo)",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        {/* Tekstur grid yang sama dengan panel brand — memudar ke bawah supaya
            tidak bersaing dengan tautan navigasi. */}
        <GridTexture className="pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />

        {/*
          Tombol pin duduk di header, bukan di kaki sidebar. Pojok kiri-bawah
          adalah wilayah yang direbut hal lain — overlay devtools, pratinjau URL
          yang dimunculkan browser saat menunjuk tautan — jadi tombol di sana
          gampang tertimpa dan tak bisa ditekan.
        */}
        <div
          className={cn(
            "relative flex h-16 items-center gap-2 px-3",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? null : (
            <>
              <Image
                src="/logo-pkp.webp"
                alt=""
                aria-hidden
                width={32}
                height={32}
                priority
                className="ml-1 size-7 shrink-0"
              />
              <span className="font-heading flex-1 truncate text-sm font-semibold tracking-tight">
                PKP Hub
              </span>
            </>
          )}

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={togglePin}
                  aria-label={pinned ? "Lepas pin sidebar" : "Pin sidebar tetap terbuka"}
                  // `aria-pressed`, bukan `aria-expanded`: ini tombol dwi-keadaan
                  // yang MENGUNCI, bukan pengungkap. Sejak hover jadi pemicu
                  // buka-tutup, "expanded" bukan lagi milik tombol ini.
                  aria-pressed={pinned}
                  className="text-muted-foreground"
                >
                  <PanelLeftIcon className={cn("transition-transform", !pinned && "rotate-180")} />
                </Button>
              }
            />
            <TooltipContent side="right">
              {pinned ? "Lepas pin sidebar" : "Pin sidebar tetap terbuka"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="relative flex-1 overflow-y-auto py-2">
          <SidebarNav links={links} collapsed={collapsed} />
        </div>

        <div className="relative border-t border-sidebar-border p-2">
          <UserMenu user={user} collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
```

Perhatikan dua perubahan halus di `<aside>`: `md:flex` jadi `md:block` (ia tidak lagi punya anak yang perlu diatur flex — isinya satu panel absolute), dan `flex-col` + seluruh gaya visual pindah ke panel.

- [ ] **Step 6: Jalankan E2E sampai hijau**

```bash
pnpm e2e e2e/sidebar.spec.ts
```

Harapan: **3 passed**.

Kalau `toHaveCSS("width", "72px")` gagal dengan angka lain, cek apakah ada override `font-size` pada `html` di `app/globals.css` — konversi rem→px ikut berubah. Sesuaikan `RAIL_PX`/`WIDE_PX`, jangan mengubah kelas Tailwind-nya.

- [ ] **Step 7: Lint + typecheck**

```bash
pnpm lint:fix && pnpm typecheck
```

Harapan: keduanya bersih. `typecheck` akan menangkap kalau masih ada pemakai `defaultCollapsed` atau `SIDEBAR_COOKIE` yang tertinggal.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/nav-config.ts app/dashboard/layout.tsx components/dashboard/sidebar.tsx e2e/sidebar.spec.ts
git commit -m "$(cat <<'EOF'
feat(sidebar): tombol ciut jadi pin, aside dipecah dari panel

<aside> sekarang cuma penahan ruang yang lebarnya ikut `pinned`; seluruh
visual pindah ke panel absolute di dalamnya. Tanpa pemisahan itu sidebar
tidak mungkin melebar tanpa menggeser kolom konten, karena <aside> adalah
flex item.

Cookie pakai nama baru pkp_sidebar_pinned. Nama lama tidak dipakai ulang
karena nilainya berarti kebalikan — siapa pun yang dulu memilih rail akan
mendapat sidebar terkunci lebar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Hover dan jalur fokus keyboard

Deliverable: panel melebar saat kursor masuk dan saat fokus keyboard mendarat di dalamnya, tanpa menggeser kolom konten. Inilah asersi inti seluruh spec.

**Files:**
- Modify: `components/dashboard/sidebar.tsx`
- Test: `e2e/sidebar.spec.ts` (tambah `describe` baru)

**Interfaces:**
- Consumes: `[data-slot="sidebar-panel"]`, `[data-slot="content-column"]` dari Task 1.
- Produces: `collapsed = !pinned && !hovered` — nilai inilah yang diterima `SidebarNav`/`UserMenu` mulai sekarang; Task 3 bergantung padanya.

- [ ] **Step 1: Tulis E2E yang gagal**

Tambahkan di akhir `e2e/sidebar.spec.ts`, setelah `describe` yang sudah ada:

```ts
test.describe("sidebar melebar saat hover", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("hover melebarkan panel TANPA menggeser konten", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);
    const before = await contentLeft(page);

    await PANEL(page).hover();

    await expectPanelWidth(page, WIDE_PX);
    await expect(PANEL(page).getByText("PKP Hub")).toBeVisible();
    // Klaim inti spec: panel menimpa, bukan mendorong.
    expect(await contentLeft(page)).toBeCloseTo(before, 0);
  });

  test("kursor pergi mengembalikan ke rail", async ({ page }) => {
    await page.goto("/dashboard");
    await PANEL(page).hover();
    await expectPanelWidth(page, WIDE_PX);

    // Geser kursor jauh ke kanan, keluar dari panel.
    await page.mouse.move(900, 400);
    await expectPanelWidth(page, RAIL_PX);
  });

  test("fokus keyboard membuka panel", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);

    // Tab dari awal dokumen sampai fokus mendarat di dalam panel. Tanpa jalur
    // fokus, pengguna keyboard akan mendarat di tautan yang labelnya
    // tersembunyi — itu sebabnya test ini ada.
    await page.locator("body").press("Tab");
    for (let i = 0; i < 8; i++) {
      if (await PANEL(page).evaluate((el) => el.contains(document.activeElement))) break;
      await page.keyboard.press("Tab");
    }

    await expect
      .poll(async () => PANEL(page).evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    await expectPanelWidth(page, WIDE_PX);
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

```bash
pnpm e2e e2e/sidebar.spec.ts
```

Harapan: 3 test lama **PASS**, 3 test baru **FAIL** — panel bertahan di 72px karena hover belum diimplementasi.

- [ ] **Step 3: Tambah state hover + kemampuan hover perangkat**

Di `components/dashboard/sidebar.tsx`, ganti import React:

```tsx
import { useEffect, useRef, useState } from "react";
```

Tambahkan konstanta di atas komponen:

```tsx
/**
 * Jeda buka menahan panel supaya tidak berkedip saat kursor cuma melintas
 * menuju konten. Jeda tutup lebih panjang agar kursor yang keluar sedikit
 * lalu balik tidak memicu tutup-buka.
 */
const OPEN_DELAY_MS = 120;
const CLOSE_DELAY_MS = 200;
```

Ganti isi awal komponen (dari `const [pinned, ...]` sampai `const collapsed = !pinned;`) dengan:

```tsx
  const [pinned, setPinned] = useState(defaultPinned);
  const [hovered, setHovered] = useState(false);
  // Diasumsikan mampu-hover sampai terbukti sebaliknya: efek di bawah jalan
  // sebelum interaksi pertama mungkin terjadi, dan menebak `true` menghindari
  // panel yang sempat salah gambar di desktop.
  const [hoverCapable, setHoverCapable] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { can } = usePermissions();
  const links = buildLinks(can);

  const collapsed = !pinned && !hovered;

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover)").matches);
  }, []);

  // Timer yang masih hidup saat komponen lepas akan memanggil setState pada
  // komponen yang sudah tidak ada.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /**
   * Jadwalkan buka/tutup karena kursor. Diam saja saat dipin (hover tidak
   * berlaku) dan saat perangkat tidak punya hover — di layar sentuh
   * `pointerenter` tetap menyala saat tap, dan tanpa penjagaan ini panel
   * nyangkut terbuka sampai pengguna menyentuh tempat lain.
   */
  function scheduleHover(next: boolean, delay: number) {
    if (pinned || !hoverCapable) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(next), delay);
  }

  /** Buka/tutup seketika — dipakai jalur fokus, yang selalu disengaja. */
  function revealNow(next: boolean) {
    if (timer.current) clearTimeout(timer.current);
    setHovered(next);
  }
```

- [ ] **Step 4: Sambungkan handler ke panel**

Masih di `sidebar.tsx`, pada `<div data-slot="sidebar-panel" ...>` tambahkan handler tepat di bawah `data-collapsed`:

```tsx
        onPointerEnter={() => scheduleHover(true, OPEN_DELAY_MS)}
        onPointerLeave={() => scheduleHover(false, CLOSE_DELAY_MS)}
        // Fase capture: `focus` tidak menggelembung, jadi tanpa `Capture`
        // fokus yang mendarat di tautan anak tidak akan pernah terdeteksi.
        onFocusCapture={() => revealNow(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            revealNow(false);
          }
        }}
```

Dan tambahkan shadow saat melebar karena hover — tanpa itu panel menyatu dengan konten di belakangnya dan batas overlay-nya tidak terbaca. Ganti baris terakhir `cn()` panel:

```tsx
          collapsed ? "w-[4.5rem]" : "w-64",
          // Hanya saat menimpa. Saat dipin tidak ada yang ditimpa.
          !pinned && !collapsed && "shadow-lg",
```

- [ ] **Step 5: Jaga keadaan saat pin dilepas**

Masih di `sidebar.tsx`, ganti `togglePin`:

```tsx
  function togglePin() {
    const next = !pinned;
    setPinned(next);
    // Saat pin dilepas, kursor sedang berada di atas tombol — yang berarti di
    // dalam panel. Tanpa baris ini `hovered` yang basi (false) membuat panel
    // langsung menciut di bawah kursor, dan ia tidak akan terbuka lagi sampai
    // kursor keluar lalu masuk kembali.
    if (!next) revealNow(true);
    // max-age 1 tahun; preferensi tata letak, bukan data sensitif.
    // biome-ignore lint/suspicious/noDocumentCookie: CookieStore API belum ada di Safari, dan tidak sepadan untuk satu penulisan cookie sesederhana ini.
    document.cookie = `${SIDEBAR_PIN_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }
```

- [ ] **Step 6: Jalankan E2E sampai hijau**

```bash
pnpm e2e e2e/sidebar.spec.ts
```

Harapan: **6 passed**.

- [ ] **Step 7: Lint + typecheck**

```bash
pnpm lint:fix && pnpm typecheck
```

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/sidebar.tsx e2e/sidebar.spec.ts
git commit -m "$(cat <<'EOF'
feat(sidebar): panel melebar saat hover dan saat fokus keyboard

Handler dipasang di panel, bukan <aside>, supaya area pemicu sama persis
dengan area yang terlihat. Jalur fokus memakai fase capture karena `focus`
tidak menggelembung — tanpa itu pengguna keyboard mendarat di tautan yang
labelnya tersembunyi.

Perilaku hover dijaga matchMedia("(hover: hover)"): di layar sentuh
pointerenter tetap menyala saat tap dan panel akan nyangkut terbuka.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Tooltip, nama aksesibel, dan visibilitas tombol pin

Deliverable: tooltip mati di sidebar desktop, tautan rail tetap punya nama aksesibel, dan tombol pin hanya tampil saat relevan — termasuk pengecualian untuk perangkat tanpa hover.

**Files:**
- Modify: `components/dashboard/sidebar-nav.tsx:22-32`, `:39-52`, `:74-85`
- Modify: `components/dashboard/sidebar.tsx`
- Test: `e2e/sidebar.spec.ts` (tambah `describe` baru)

**Interfaces:**
- Consumes: `collapsed` dari Task 2, `hoverCapable` dari Task 2.
- Produces: `SidebarNav({ links, collapsed?, showTooltips?, onNavigate? })` — `showTooltips` default `true` supaya laci mobile tidak ikut berubah.

- [ ] **Step 1: Tulis E2E yang gagal**

Tambahkan di akhir `e2e/sidebar.spec.ts`:

```ts
test.describe("sidebar rail tetap terbaca", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("tautan ikon punya nama aksesibel saat rail", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);

    // Labelnya tidak tergambar saat rail, tapi nama aksesibelnya HARUS ada —
    // sejak tooltip dimatikan, `aria-label` satu-satunya yang tersisa untuk
    // pembaca layar.
    await expect(PANEL(page).getByRole("link", { name: "Proyek" })).toBeAttached();
    await expect(PANEL(page).getByText("Proyek")).toBeHidden();
  });

  test("tombol pin tersembunyi di rail, muncul saat melebar", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);
    // Di rail sempit tombol ini berdesakan dengan ikon nav dan gampang
    // tertekan tak sengaja.
    await expect(PIN_BUTTON(page)).toBeHidden();

    await PANEL(page).hover();
    await expect(PIN_BUTTON(page)).toBeVisible();
  });
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**

```bash
pnpm e2e e2e/sidebar.spec.ts
```

Harapan: 6 test lama **PASS**, 2 test baru **FAIL** — tautan belum punya `aria-label`, dan tombol pin masih tampil di rail.

- [ ] **Step 3: Tambah `showTooltips` + `aria-label` di SidebarNav**

Di `components/dashboard/sidebar-nav.tsx`, ganti tanda tangan komponen (baris 22-32):

```tsx
export function SidebarNav({
  links,
  collapsed = false,
  showTooltips = true,
  onNavigate,
}: {
  links: NavLink[];
  collapsed?: boolean;
  /**
   * Matikan di sidebar desktop: di sana hover yang memunculkan tooltip adalah
   * hover yang SAMA dengan yang melebarkan panel, jadi labelnya muncul dua
   * kali sekaligus dan tooltip melayang di atas panel yang baru terbuka.
   * Default `true` supaya laci mobile tidak ikut berubah.
   */
  showTooltips?: boolean;
  onNavigate?: () => void;
}) {
```

Ganti elemen `<Link>` (baris 39-52) — tambahkan `aria-label` saat menciut:

```tsx
        const item = (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            // Saat menciut label tidak dirender, jadi tautan tinggal ikon tanpa
            // nama sama sekali bagi pembaca layar. Sejak tooltip dimatikan di
            // sidebar desktop, atribut inilah satu-satunya yang menamainya.
            aria-label={collapsed ? link.label : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              collapsed && "justify-center px-0",
            )}
          >
```

Ganti blok return tooltip (baris 74-85):

```tsx
        // Saat menciut, label jadi tooltip — kalau tidak, sidebar rail hanya
        // deretan ikon tanpa nama. Tidak berlaku di sidebar desktop, yang
        // mengungkap labelnya dengan melebar (lihat `showTooltips`).
        return collapsed && showTooltips ? (
          <Tooltip key={link.href}>
            <TooltipTrigger render={item} />
            <TooltipContent side="right">{link.label}</TooltipContent>
          </Tooltip>
        ) : (
          item
        );
```

- [ ] **Step 4: Matikan tooltip dan atur visibilitas tombol pin**

Di `components/dashboard/sidebar.tsx`, teruskan `showTooltips={false}`:

```tsx
          <SidebarNav links={links} collapsed={collapsed} showTooltips={false} />
```

Lalu bungkus tombol pin dengan syarat visibilitas. Ganti seluruh blok `<Tooltip>…</Tooltip>` milik tombol pin dengan:

```tsx
          {/*
            Sembunyikan tombol di rail sempit — di sana ia berdesakan dengan
            ikon nav dan gampang tertekan tak sengaja.

            KECUALI saat perangkat tidak punya hover: di layar sentuh panel
            tidak pernah melebar, jadi aturan di atas akan menyembunyikan
            tombol ini selamanya — padahal pin justru satu-satunya jalan keluar
            dari rail di sana.
          */}
          {!collapsed || !hoverCapable ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={togglePin}
              aria-label={pinned ? "Lepas pin sidebar" : "Pin sidebar tetap terbuka"}
              // `aria-pressed`, bukan `aria-expanded`: ini tombol dwi-keadaan
              // yang MENGUNCI, bukan pengungkap. Sejak hover jadi pemicu
              // buka-tutup, "expanded" bukan lagi milik tombol ini.
              aria-pressed={pinned}
              className="text-muted-foreground"
            >
              <PanelLeftIcon className={cn("transition-transform", !pinned && "rotate-180")} />
            </Button>
          ) : null}
```

Tooltip pada tombol pin ikut dibuang — `aria-label`-nya sudah menamainya, dan tombol ini hanya tampil saat panel melebar di mana teksnya tidak lagi dibutuhkan. Hapus import `Tooltip`, `TooltipContent`, `TooltipTrigger` dari `sidebar.tsx` karena sudah tidak terpakai.

- [ ] **Step 5: Jalankan E2E sampai hijau**

```bash
pnpm e2e e2e/sidebar.spec.ts
```

Harapan: **8 passed**.

- [ ] **Step 6: Lint + typecheck**

```bash
pnpm lint:fix && pnpm typecheck
```

Harapan: bersih. Biome akan menandai import `Tooltip` yang tertinggal di `sidebar.tsx` kalau lupa dihapus.

- [ ] **Step 7: Periksa laci mobile tidak ikut berubah**

```bash
pnpm e2e
```

Harapan: seluruh suite hijau, termasuk spec lama yang menyentuh navigasi. `SidebarNav` dipakai bersama laci mobile, dan `showTooltips` default `true` menjaga perilakunya.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/sidebar-nav.tsx components/dashboard/sidebar.tsx e2e/sidebar.spec.ts
git commit -m "$(cat <<'EOF'
feat(sidebar): matikan tooltip rail, jaga nama aksesibel dan tombol pin

Tooltip menyala pada hover yang sama dengan yang melebarkan panel, jadi
label muncul dua kali sekaligus. Mematikannya membuat tautan rail jadi ikon
tanpa nama sama sekali bagi pembaca layar, maka `aria-label` ditambahkan
saat menciut.

Tombol pin disembunyikan di rail sempit, kecuali pada perangkat tanpa hover
— di sana panel tidak pernah melebar dan pin satu-satunya jalan keluar dari
rail.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Verifikasi akhir

- [ ] `pnpm lint` bersih
- [ ] `pnpm typecheck` bersih
- [ ] `pnpm e2e` seluruh suite hijau
- [ ] Periksa manual di browser dengan DevTools device toolbar (emulasi sentuh, lebar ≥768px): tombol pin terlihat di rail, dan tap tidak membuat panel nyangkut terbuka.
