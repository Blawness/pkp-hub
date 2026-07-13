# Sistem Motion + Login Split-Screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bangun fondasi motion PKP Hub (token, kebijakan reduced-motion, primitif) lalu terapkan di `/` dan `/login` — termasuk panel brand bersama dan morph antar-route.

**Architecture:** Token motion masuk ke `app/globals.css` sejajar token warna. Kebijakan reduced-motion ditegakkan satu kali secara global lewat `<MotionConfig reducedMotion="user">` (library `motion` otomatis membuang animasi transform tapi mempertahankan opacity — persis kebijakan spec) plus satu media query CSS untuk view transitions. Panel brand diekstrak dari `app/page.tsx` menjadi `BrandPanel` client component yang dipakai bersama oleh `/` dan `/login`; `app/page.tsx` tetap server component sehingga redirect berbasis role tidak pindah ke client. Morph antar-route memakai `<ViewTransition>` React + `experimental.viewTransition`.

**Tech Stack:** Next.js 16.2.10 (App Router, Turbopack), React 19.2.4, `motion` v12 (`motion/react`), Tailwind v4 (`@theme inline` di `app/globals.css`), Base UI (`components/ui/*`), Vitest (`environment: "node"`).

## Fakta yang Sudah Diverifikasi (jangan diragukan lagi, sudah dibuktikan dengan spike)

- `import { ViewTransition } from "react"` **lolos typecheck** di repo ini — `@types/react` 19.2.17 sudah membawa tipe canary-nya. **Jangan** pakai `unstable_ViewTransition`: nama itu TIDAK ada dan menghasilkan `error TS2305`.
- Dengan `experimental: { viewTransition: true }` di `next.config.ts`, halaman yang merender `<ViewTransition>` berhasil render (HTTP 200, log server bersih).
- Folder berawalan underscore (`app/_foo`) adalah **private folder** dan tidak jadi route. Jangan menaruh halaman di situ.

## Global Constraints

- Satu-satunya dependency baru: **`motion`** (v12, impor dari `motion/react`). Tidak ada paket lain.
- Durasi dan easing **tidak boleh ditulis langsung di komponen** — komponen memakai token dari `app/globals.css`.
- Nilai token **verbatim**: `--motion-fast: 150ms`, `--motion-base: 260ms`, `--motion-slow: 420ms`, `--motion-stagger: 40ms`, `--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)`, `--ease-standard: cubic-bezier(0.4, 0, 0.2, 1)`.
- Entrance hanya translate **8–12px**. Parallax maksimum **±6px**.
- **`prefers-reduced-motion`:** gerakan posisi mati total; crossfade opacity tetap hidup. Parallax dan morph tidak dijalankan sama sekali. Jangan menulis deteksi sendiri — pakai mekanisme library.
- **`app/page.tsx` tetap server component.** `getSession()` dan `redirect()` tidak boleh pindah ke client. Jangan menambahkan `"use client"` ke file itu.
- **Logika `components/auth/login-form.tsx` tidak boleh diubah.** `sanitizeRedirectTo()` dan alur `onSubmit` menutup lubang open-redirect — yang boleh ditambah hanya lapisan motion pada pesan error dan state tombol.
- Tidak ada aset gambar baru. Tekstur grid tetap CSS gradient.
- Tidak ada token warna baru (`--brand-base`, `--brand-primary`, `--brand-accent` sudah ada).
- Bahasa antarmuka: Indonesia.
- `Button` (Base UI) **tidak punya** prop `asChild`; link button memakai `render={<Link href="...">Teks</Link>}`.
- Vitest `environment: "node"` — **tidak ada jsdom/RTL. Jangan menulis test untuk animasi.** Test yang "menguji" animasi tanpa DOM hanya lolos tanpa membuktikan apa pun. Yang wajib dijaga: 99 test existing tetap hijau, `pnpm typecheck` dan `pnpm lint` bersih.

---

### Task 1: Dependency + token motion + kebijakan reduced-motion

**Files:**
- Modify: `package.json` (lewat `pnpm add`, jangan disunting tangan)
- Modify: `app/globals.css` (blok `@theme inline` di baris 7-dst, dan `@layer base` di baris 128-dst)
- Create: `components/motion/motion-provider.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: token CSS `--motion-fast` / `--motion-base` / `--motion-slow` / `--motion-stagger` / `--ease-out-expo` / `--ease-standard`; komponen `<MotionProvider>` (client) yang membungkus seluruh aplikasi. Task 2 dan 3 bergantung pada keduanya.

- [ ] **Step 1: Pasang `motion`**

```bash
pnpm add motion
```

Pastikan versinya v12.x: `node -p "require('motion/package.json').version"`. Kalau yang terpasang bukan 12.x, hentikan dan laporkan — jangan lanjut dengan versi lain.

- [ ] **Step 2: Tambahkan token motion ke `app/globals.css`**

Di dalam blok `@theme inline { ... }` (dimulai baris 7), tambahkan enam token ini tepat setelah baris `--font-heading: var(--font-sans);`:

```css
  --motion-fast: 150ms;
  --motion-base: 260ms;
  --motion-slow: 420ms;
  --motion-stagger: 40ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
```

- [ ] **Step 3: Tambahkan kebijakan reduced-motion untuk view transitions**

Di akhir `app/globals.css`, tambahkan blok ini. Ia hanya mengurus animasi **view transition** (yang dijalankan browser, bukan library `motion` — animasi library ditangani `MotionConfig` di Step 4).

```css
/*
 * Kebijakan reduced-motion untuk view transitions.
 * Morph antar-route adalah gerakan posisi, jadi ia dimatikan total di sini.
 * Animasi milik library `motion` TIDAK diurus blok ini — lihat
 * `components/motion/motion-provider.tsx`, yang mempertahankan crossfade
 * opacity dan hanya membuang transform.
 */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}
```

- [ ] **Step 4: Buat `components/motion/motion-provider.tsx`**

```tsx
"use client";

import { MotionConfig } from "motion/react";

/**
 * Kebijakan motion untuk seluruh aplikasi.
 *
 * `reducedMotion="user"` membuat `motion` membaca `prefers-reduced-motion`
 * milik OS dan membuang animasi transform (translate/scale/rotate) sambil
 * MEMPERTAHANKAN animasi opacity. Itu persis kebijakan yang kita mau:
 * mematikan segalanya justru membuat konten melompat, yang lebih buruk
 * daripada gerakan halus.
 *
 * Jangan mendeteksi `prefers-reduced-motion` sendiri di komponen — cukup
 * pakai primitif di `components/motion/`, dan kebijakan ini berlaku otomatis.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

- [ ] **Step 5: Pasang provider di `app/layout.tsx`**

Tambahkan impor di bagian atas file:

```tsx
import { MotionProvider } from "@/components/motion/motion-provider";
```

Lalu bungkus `{children}` di dalam `<body>`. Elemen `<body>` yang ada sekarang berbunyi:

```tsx
      <body className="min-h-full flex flex-col">{children}</body>
```

Ubah menjadi:

```tsx
      <body className="min-h-full flex flex-col">
        <MotionProvider>{children}</MotionProvider>
      </body>
```

Jangan mengubah apa pun lagi di file ini — khususnya `robots` (aplikasi ini sengaja `noindex`) dan `lang="id"`.

- [ ] **Step 6: Typecheck, lint, dan seluruh suite test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: typecheck bersih, lint bersih, 99/99 test lulus. `MotionConfig` tidak menyentuh logika apa pun, jadi kalau ada test yang jatuh di sini, berhenti dan laporkan — jangan "perbaiki" test-nya.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml app/globals.css components/motion/motion-provider.tsx app/layout.tsx
git commit -m "Fondasi motion: dependency, token, kebijakan reduced-motion"
```

---

### Task 2: Primitif `Reveal` dan `Stagger`

**Files:**
- Create: `components/motion/reveal.tsx`

**Interfaces:**
- Consumes: `<MotionProvider>` dari Task 1 (sudah terpasang global, tidak perlu diimpor lagi); token `--motion-base`, `--motion-stagger`, `--ease-out-expo`.
- Produces:
  - `<Stagger className?: string>` — membungkus sekumpulan `<Reveal>`; memberi jeda berjenjang pada anak-anaknya.
  - `<Reveal className?: string>` — satu elemen yang masuk dengan fade + translate 10px ke atas.
  Task 3 dan Task 4 memakai keduanya.

- [ ] **Step 1: Tulis `components/motion/reveal.tsx`**

Nilai numerik di sini **diturunkan dari token**, tidak ditulis lepas: `motion` butuh angka dalam detik, jadi konstanta di file ini adalah satu-satunya tempat token dipetakan ke angka library. Tidak ada komponen lain yang boleh menulis durasi/easing sendiri.

```tsx
"use client";

import { motion, type Variants } from "motion/react";

/**
 * Primitif entrance untuk seluruh aplikasi.
 *
 * Angka-angka di bawah adalah pemetaan satu-satu dari token di
 * `app/globals.css` (`--motion-base`, `--motion-stagger`, `--ease-out-expo`).
 * `motion` menerima detik dan array cubic-bezier, bukan string CSS, jadi
 * pemetaan itu harus terjadi di suatu tempat — tempatnya di sini, sekali.
 * Komponen lain memakai <Reveal>/<Stagger> dan tidak pernah menulis durasi
 * atau easing sendiri.
 *
 * Kebijakan prefers-reduced-motion tidak diurus di sini: <MotionConfig
 * reducedMotion="user"> di components/motion/motion-provider.tsx membuang
 * `y` (transform) dan menyisakan `opacity` secara otomatis.
 */
const DURATION_BASE = 0.26; // --motion-base: 260ms
const STAGGER = 0.04; // --motion-stagger: 40ms
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const; // --ease-out-expo

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: STAGGER },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION_BASE, ease: EASE_OUT_EXPO },
  },
};

export function Stagger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

export function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 2: Typecheck dan lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: dua-duanya bersih. Kalau `ease: EASE_OUT_EXPO` ditolak tipenya, ubah `as const` menjadi anotasi eksplisit `[number, number, number, number]` — **jangan** menggantinya dengan string easing bawaan seperti `"easeInOut"`, itu justru yang spec larang.

- [ ] **Step 3: Commit**

```bash
git add components/motion/reveal.tsx
git commit -m "Primitif motion: Reveal + Stagger"
```

---

### Task 3: `BrandPanel` bersama + parallax, dipakai `/`

**Files:**
- Create: `components/brand/brand-panel.tsx`
- Modify: `app/page.tsx` (ganti panel brand inline dengan `<BrandPanel />`)

**Interfaces:**
- Consumes: `<Reveal>` dan `<Stagger>` dari Task 2.
- Produces: `<BrandPanel />` — client component tanpa prop. Task 4 memakainya di `/login`.

- [ ] **Step 1: Buat `components/brand/brand-panel.tsx`**

Isi panel ini dipindahkan **apa adanya** dari `app/page.tsx` baris 40-77 (wordmark, tagline, daftar layanan, footer, tekstur grid, glow) — teksnya jangan diubah. Yang ditambahkan hanya parallax dan stagger.

```tsx
"use client";

import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import type { PointerEvent } from "react";
import { Reveal, Stagger } from "@/components/motion/reveal";

const LAYANAN = ["Survey topografi", "Pengukuran lahan", "Pemetaan digital"];

/** Simpangan maksimum grid saat parallax, dalam px. */
const PARALLAX_RANGE = 6;

/**
 * Panel brand — satu-satunya definisi di aplikasi, dipakai bersama oleh `/`
 * dan `/login`. Membungkusnya dengan <ViewTransition name="brand-panel"> di
 * kedua halaman itulah yang membuat panel ini BERTAHAN saat navigasi antara
 * keduanya, alih-alih hilang lalu muncul lagi.
 *
 * Parallax hanya berjalan untuk pointer mouse (`event.pointerType`), jadi
 * perangkat sentuh tidak pernah menjalankannya. Saat pengguna meminta
 * reduced-motion, <MotionConfig reducedMotion="user"> membuang transform-nya,
 * sehingga grid diam meski nilai motion tetap berubah.
 */
export function BrandPanel() {
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  // Spring meredam gerakan supaya grid tidak "menempel" kaku di kursor.
  const springX = useSpring(pointerX, { stiffness: 120, damping: 20, mass: 0.4 });
  const springY = useSpring(pointerY, { stiffness: 120, damping: 20, mass: 0.4 });

  // -0.5..0.5 (posisi relatif kursor) -> -6..6 px
  const gridX = useTransform(springX, [-0.5, 0.5], [-PARALLAX_RANGE, PARALLAX_RANGE]);
  const gridY = useTransform(springY, [-0.5, 0.5], [-PARALLAX_RANGE, PARALLAX_RANGE]);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function handlePointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="relative flex flex-col justify-between overflow-hidden bg-brand-base px-8 py-10 text-white lg:px-12 lg:py-14"
    >
      {/* Tekstur grid. CSS murni — tidak ada aset gambar. Digeser oleh parallax. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-8"
        style={{
          x: gridX,
          y: gridY,
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Cahaya aksen di sudut, biar grid-nya tidak terbaca rata seperti kertas milimeter. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-30 blur-3xl"
        style={{ background: "var(--brand-accent)" }}
      />

      <Stagger className="relative">
        <Reveal>
          <p className="font-heading text-xl font-semibold tracking-tight">PKP Hub</p>
          <p className="mt-1 text-sm text-white/60">Presisi Konsulindo Prima</p>
        </Reveal>
      </Stagger>

      <Stagger className="relative mt-10 lg:mt-0">
        <Reveal>
          <p className="font-heading text-2xl leading-snug font-medium text-balance lg:text-3xl">
            Presisi dalam setiap ukuran.
          </p>
        </Reveal>
        <ul className="mt-6 space-y-2.5">
          {LAYANAN.map((item) => (
            <Reveal key={item}>
              <li className="flex items-center gap-2.5 text-sm text-white/70">
                <span aria-hidden className="size-1.5 rounded-full bg-brand-accent" />
                {item}
              </li>
            </Reveal>
          ))}
        </ul>
      </Stagger>

      {/*
        Footer juga dibungkus <Stagger>, bukan <Reveal> telanjang: <Reveal>
        hanya mendeklarasikan variants, dan variants baru dijalankan bila ada
        induk yang memicunya (`initial`/`animate` ada di <Stagger>). <Reveal>
        yang berdiri sendiri tidak akan pernah beranimasi.
      */}
      <Stagger className="relative mt-10 lg:mt-0">
        <Reveal>
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Presisi Konsulindo Prima
          </p>
        </Reveal>
      </Stagger>
    </div>
  );
}
```

- [ ] **Step 2: Pakai `BrandPanel` di `app/page.tsx`**

Buang konstanta `LAYANAN` (baris 7) — sekarang tinggal di `BrandPanel`. Buang seluruh `<div>` panel brand (baris 40-77) dan gantikan dengan `<BrandPanel />`. Tambahkan impor:

```tsx
import { BrandPanel } from "@/components/brand/brand-panel";
```

Setelah diubah, isi `<main>` menjadi:

```tsx
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <BrandPanel />

      {/* Panel aksi. */}
      <div className="flex items-center justify-center px-8 py-14 lg:px-16">
```

Sisa panel aksi (heading, deskripsi, tombol Masuk, kartu Area, kalimat penutup) **tidak berubah** di task ini.

**`app/page.tsx` tetap server component.** Jangan menambahkan `"use client"` — `BrandPanel` sudah client, dan sebuah server component boleh merender client component sebagai anak. `getSession()` dan `redirect()` tetap di server.

- [ ] **Step 3: Typecheck, lint, seluruh test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: bersih, 99/99 lulus.

- [ ] **Step 4: Verifikasi `/` masih hidup dan redirect masih jalan**

Jalankan `pnpm dev` bila belum jalan, lalu:

```bash
curl -s -o /dev/null -w "anonim / -> %{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/ | grep -c "Presisi dalam setiap ukuran"
```

Expected: `200`, lalu `1` atau lebih.

- [ ] **Step 5: Commit**

```bash
git add components/brand/brand-panel.tsx app/page.tsx
git commit -m "BrandPanel bersama: ekstrak dari homepage, tambah parallax + stagger"
```

---

### Task 4: Login split-screen + morph + motion form

**Files:**
- Modify: `next.config.ts`
- Modify: `app/login/page.tsx`
- Modify: `app/page.tsx` (bungkus `<BrandPanel />` dengan `<ViewTransition>`)
- Modify: `components/auth/login-form.tsx` (**hanya** lapisan motion pada error dan tombol)

**Interfaces:**
- Consumes: `<BrandPanel />` (Task 3), `<Reveal>`/`<Stagger>` (Task 2).
- Produces: halaman `/login` split-screen dan morph `/` ↔ `/login`. Tidak ada task setelah ini.

- [ ] **Step 1: Aktifkan view transitions di `next.config.ts`**

File sekarang berbunyi `const nextConfig: NextConfig = {};`. Ubah menjadi:

```ts
const nextConfig: NextConfig = {
  // Mengaktifkan <ViewTransition> React, dipakai untuk mempertahankan panel
  // brand saat navigasi / <-> /login. Masih eksperimental di Next 16;
  // tanpa dukungan browser, navigasi tetap normal — hanya tidak beranimasi.
  experimental: {
    viewTransition: true,
  },
};
```

Jangan menyentuh baris `import "./env";` — itu yang menggagalkan build lebih awal saat env tidak lengkap.

- [ ] **Step 2: Bungkus `BrandPanel` di `app/page.tsx` dengan `<ViewTransition>`**

Tambahkan impor. **Gunakan nama ini persis** — sudah diverifikasi lolos typecheck di repo ini. `unstable_ViewTransition` TIDAK ada dan akan menghasilkan `error TS2305`:

```tsx
import { ViewTransition } from "react";
```

Lalu ganti `<BrandPanel />` menjadi:

```tsx
      <ViewTransition name="brand-panel">
        <BrandPanel />
      </ViewTransition>
```

- [ ] **Step 3: Tulis ulang `app/login/page.tsx`**

Nama `brand-panel` harus **identik** dengan yang dipakai di `app/page.tsx` — nama itulah yang memberi tahu browser bahwa kedua elemen ini adalah elemen yang sama, dan tanpa kecocokan itu morph-nya tidak terjadi.

```tsx
import { Suspense, ViewTransition } from "react";
import { BrandPanel } from "@/components/brand/brand-panel";
import { LoginForm } from "@/components/auth/login-form";
import { Reveal, Stagger } from "@/components/motion/reveal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <ViewTransition name="brand-panel">
        <BrandPanel />
      </ViewTransition>

      <div className="flex items-center justify-center px-8 py-14 lg:px-16">
        <Stagger className="w-full max-w-md">
          <Reveal>
            <Card>
              <CardHeader>
                <CardTitle>Masuk ke PKP Hub</CardTitle>
                <CardDescription>
                  Dashboard internal untuk staf, portal untuk klien survey.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* useSearchParams() (untuk `redirectTo`) butuh Suspense boundary. */}
                <Suspense fallback={null}>
                  <LoginForm />
                </Suspense>
              </CardContent>
            </Card>
          </Reveal>
        </Stagger>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Tambahkan motion pada error dan tombol di `components/auth/login-form.tsx`**

**Logika file ini tidak boleh disentuh.** Jangan mengubah `sanitizeRedirectTo()`, `loginSchema`, `onSubmit`, atau perhitungan `destination` — semuanya menutup lubang open-redirect. Yang diubah hanya bagian render.

Tambahkan impor:

```tsx
import { AnimatePresence, motion } from "motion/react";
```

Ganti baris 97 yang sekarang berbunyi:

```tsx
      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
```

menjadi:

```tsx
      <AnimatePresence>
        {formError ? (
          <motion.p
            className="text-sm text-destructive"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {formError}
          </motion.p>
        ) : null}
      </AnimatePresence>
```

(`0.15` = `--motion-fast`; `[0.16, 1, 0.3, 1]` = `--ease-out-expo`.)

Teks tombol submit saat ini berbahasa Inggris sementara sisa aplikasi berbahasa Indonesia. Selaraskan sekalian — ganti baris 98-100:

```tsx
      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting ? "Masuk..." : "Masuk"}
      </Button>
```

- [ ] **Step 5: Typecheck, lint, seluruh test**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: bersih, 99/99 lulus. Kalau ada test auth yang jatuh, kamu menyentuh logika yang dilarang — kembalikan, jangan ubah test-nya.

- [ ] **Step 6: Verifikasi kedua halaman hidup**

```bash
curl -s -o /dev/null -w "/      -> %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "/login -> %{http_code}\n" http://localhost:3000/login
curl -s http://localhost:3000/login | grep -c "Masuk ke PKP Hub"
```

Expected: `200`, `200`, lalu `1` atau lebih.

- [ ] **Step 7: Verifikasi login masih benar-benar berfungsi**

Morph tidak boleh dibayar dengan auth yang rusak.

```bash
curl -s -o /dev/null -w "login owner -> %{http_code}\n" -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -d '{"email":"owner@pkp.test","password":"password123"}'
```

Expected: `200`. (Jangan menjalankan `pnpm db:seed` — ia menghapus tabel.)

- [ ] **Step 8: Commit**

```bash
git add next.config.ts app/login/page.tsx app/page.tsx components/auth/login-form.tsx
git commit -m "Login split-screen + morph brand panel antar-route"
```

---

## Verifikasi Akhir (dengan mata, di browser — tidak bisa diotomatiskan)

Ini bukan formalitas: semua langkah di atas hanya membuktikan halaman *render*, bukan bahwa animasinya benar. Nyatakan apa adanya bila ada yang tidak sesuai — jangan mengklaim lolos tanpa melihat.

- [ ] Buka `/`, klik **Masuk**. Panel brand kiri **bertahan di tempat** (tidak berkedip/hilang-muncul); hanya sisi kanan yang berganti jadi form.
- [ ] Gerakkan kursor di atas panel brand: grid bergeser halus, maksimum ±6px, dengan redaman spring.
- [ ] Buka `/` di lebar 375px: dua panel menumpuk, tidak ada scroll horizontal.
- [ ] Aktifkan "reduce motion" di OS, lalu ulangi: **tidak ada gerakan posisi sama sekali** (grid diam, elemen tidak menggeser masuk), tetapi konten tetap muncul dengan fade — dan tidak ada konten yang melompat.
- [ ] Submit form dengan password salah: pesan error muncul dengan fade, tidak menyentak.

## Kriteria Selesai (dari spec)

- [ ] `/login` split-screen memakai `BrandPanel` yang sama persis dengan `/` (satu komponen, bukan dua salinan). (Task 3 + 4)
- [ ] Navigasi `/` → `/login` memorf; panel brand bertahan. (Task 4, Verifikasi Akhir)
- [ ] Token motion ada di `app/globals.css`; tidak ada durasi/easing lepas di komponen selain pemetaan token di `reveal.tsx`. (Task 1 + 2)
- [ ] `prefers-reduced-motion`: nol gerakan posisi, crossfade hidup, tidak ada lompatan. (Task 1, Verifikasi Akhir)
- [ ] Parallax mati di perangkat sentuh (dijaga oleh `event.pointerType !== "mouse"`). (Task 3)
- [ ] Redirect role di `/` tetap jalan; `sanitizeRedirectTo()` tidak berubah. (Task 3 Step 4, Task 4 Step 7)
- [ ] 99 test existing hijau; typecheck & lint bersih. (setiap task)
