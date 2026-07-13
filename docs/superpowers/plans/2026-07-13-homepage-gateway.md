# Homepage Gerbang Internal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ganti placeholder Phase 0 di `/` dengan halaman gerbang internal split-screen, plus redirect otomatis ke area sesuai role untuk user yang sudah login.

**Architecture:** `app/page.tsx` jadi server component. Ia membaca session lewat `getSession()` yang sudah ada di `lib/auth-guards.ts` (mengembalikan `null` saat anonim, tidak pernah melempar). Kalau ada session, `redirect()` ke tujuan sesuai role; kalau tidak, render halaman gerbang. Keputusan role→tujuan diambil dari `homeForRole()` yang sudah ada di `lib/auth-guards.ts` — sekarang masih private, jadi Task 1 mengekspornya dan menutupnya dengan unit test. UI-nya murni presentational, memakai `Button` + `Card` yang sudah ada.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React server components, Tailwind v4 (`@theme` tokens di `app/globals.css`), Base UI (`components/ui/*`), Better Auth, Vitest (environment: `node`).

## Global Constraints

- **Nol dependency baru.** Jangan tambah paket apa pun ke `package.json`.
- **Nol aset gambar baru.** Tekstur grid/kontur dibuat dengan CSS (`background-image` berbasis gradient).
- **Nol token warna baru.** Pakai yang sudah ada di `app/globals.css`: `--brand-base` (`#0a0d14`), `--brand-primary` (`#1b6fd8`), `--brand-accent` (`#3fa3ff`).
- **Nol helper auth baru.** Pakai `getSession()` yang sudah ada. Jangan pakai `requireUser()` / `requireRole()` di halaman ini — keduanya memaksa redirect ke `/login`, yang membuat halaman gerbangnya mustahil dilihat pengunjung anonim.
- **Jangan ubah `robots`** di `app/layout.tsx`. Aplikasi ini sengaja `noindex`.
- **Bahasa antarmuka: Indonesia**, mengikuti seluruh dashboard.
- Tombol memakai pola Base UI yang sudah dipakai di `app/not-found.tsx`: `<Button render={<Link href="...">Teks</Link>} />`. `Button` **tidak** punya prop `asChild`.
- Vitest memakai `environment: "node"` — **tidak ada jsdom/React Testing Library**. Jangan tulis test yang me-render komponen; test hanya untuk logika murni.
- Teks salinan (tagline, nama layanan) sudah disetujui pemilik repo, dipakai verbatim dari Task 2.

---

### Task 1: Ekspor & kunci logika role→tujuan

`homeForRole()` sudah ada di `lib/auth-guards.ts:28-30` tapi masih private, padahal `app/page.tsx` butuh keputusan yang sama persis. Ekspor fungsinya dan tutup dengan unit test, supaya kalau nanti ada yang mengubah pemetaan role, test-nya jeblok.

**Files:**
- Modify: `lib/auth-guards.ts:27-30`
- Create: `lib/home-for-role.test.ts`

**Interfaces:**
- Consumes: `Role` type dari `lib/auth-guards.ts` (`"owner" | "surveyor" | "client"`).
- Produces: `homeForRole(role: Role): string` — diekspor dari `lib/auth-guards.ts`. Task 2 memakainya.

- [ ] **Step 1: Tulis test yang gagal**

Buat `lib/home-for-role.test.ts`. Test ini murni — tidak menyentuh DB, jadi tidak perlu fixture atau teardown seperti `lib/auth-guards.test.ts`.

```typescript
import { describe, expect, it } from "vitest";
import { homeForRole } from "@/lib/auth-guards";

/**
 * Pemetaan role -> area ini dipakai di dua tempat: guard `requireRole()` dan
 * redirect di `app/page.tsx`. Kalau pemetaannya berubah diam-diam, staf bisa
 * mendarat di portal klien (atau sebaliknya) — test ini yang menahannya.
 */
describe("homeForRole", () => {
  it("mengirim owner ke dashboard staf", () => {
    expect(homeForRole("owner")).toBe("/dashboard");
  });

  it("mengirim surveyor ke dashboard staf", () => {
    expect(homeForRole("surveyor")).toBe("/dashboard");
  });

  it("mengirim client ke portal klien", () => {
    expect(homeForRole("client")).toBe("/portal");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

```bash
pnpm test lib/home-for-role.test.ts
```

Expected: FAIL. Pesannya soal `homeForRole` tidak diekspor / bukan fungsi (mis. `TypeError: homeForRole is not a function`, atau error transform soal export yang tidak ada).

- [ ] **Step 3: Ekspor fungsinya**

Di `lib/auth-guards.ts`, ubah baris 27-30 dari:

```typescript
/** URL prefix each role should land on / be bounced back to. */
function homeForRole(role: Role): string {
  return role === "client" ? "/portal" : "/dashboard";
}
```

menjadi:

```typescript
/** URL prefix each role should land on / be bounced back to. */
export function homeForRole(role: Role): string {
  return role === "client" ? "/portal" : "/dashboard";
}
```

Hanya menambah kata `export`. Jangan ubah badan fungsinya — `requireRole()` sudah memakainya dan perilakunya harus tetap sama.

- [ ] **Step 4: Jalankan test, pastikan LULUS**

```bash
pnpm test lib/home-for-role.test.ts
```

Expected: PASS, 3 test lulus.

- [ ] **Step 5: Commit**

```bash
git add lib/auth-guards.ts lib/home-for-role.test.ts
git commit -m "Ekspor homeForRole + unit test pemetaan role ke area"
```

---

### Task 2: Halaman gerbang + redirect berbasis role

**Files:**
- Modify: `app/page.tsx` (ganti total isinya)

**Interfaces:**
- Consumes: `getSession()` dan `homeForRole()` dari `lib/auth-guards.ts` (Task 1); `Button` dari `components/ui/button.tsx`; `Card`, `CardHeader`, `CardTitle`, `CardDescription` dari `components/ui/card.tsx`.
- Produces: halaman `/`. Tidak ada modul lain yang mengimpor darinya.

- [ ] **Step 1: Tulis ulang `app/page.tsx`**

Ganti seluruh isi file dengan:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSession, homeForRole } from "@/lib/auth-guards";

const LAYANAN = ["Survey topografi", "Pengukuran lahan", "Pemetaan digital"];

const AREA = [
  {
    nama: "Area Staf",
    untuk: "Owner & surveyor",
    deskripsi: "Kelola proyek, penugasan surveyor, dokumen, dan invoice.",
  },
  {
    nama: "Portal Klien",
    untuk: "Klien survey",
    deskripsi: "Pantau progres proyek dan unduh dokumen hasil pengukuran.",
  },
];

/**
 * Gerbang internal. Pengunjung anonim melihat halaman ini; user yang sudah
 * login langsung dilempar ke areanya sendiri — root URL bukan tempat kerja
 * siapa pun.
 *
 * Redirect di sini murni kenyamanan, BUKAN batas keamanan: yang menjaga
 * `/dashboard` dan `/portal` tetap helper di `lib/auth-guards.ts`. Halaman ini
 * sendiri tidak menyentuh data proyek maupun klien.
 */
export default async function Home() {
  const session = await getSession();
  if (session) {
    redirect(homeForRole(session.user.role));
  }

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Panel brand. Tekstur grid-nya CSS murni — tidak ada aset gambar. */}
      <div
        className="relative flex flex-col justify-between overflow-hidden bg-brand-base px-8 py-10 text-white lg:px-12 lg:py-14"
        style={{
          backgroundImage:
            "linear-gradient(to right, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      >
        {/* Cahaya aksen di sudut, biar grid-nya tidak terbaca rata seperti kertas milimeter. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full opacity-30 blur-3xl"
          style={{ background: "var(--brand-accent)" }}
        />

        <div className="relative">
          <p className="font-heading text-xl font-semibold tracking-tight">PKP Hub</p>
          <p className="mt-1 text-sm text-white/60">Presisi Konsulindo Prima</p>
        </div>

        <div className="relative mt-10 lg:mt-0">
          <p className="font-heading text-2xl leading-snug font-medium text-balance lg:text-3xl">
            Presisi dalam setiap ukuran.
          </p>
          <ul className="mt-6 space-y-2.5">
            {LAYANAN.map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-sm text-white/70">
                <span aria-hidden className="size-1.5 rounded-full bg-brand-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 text-xs text-white/40 lg:mt-0">
          © {new Date().getFullYear()} Presisi Konsulindo Prima
        </p>
      </div>

      {/* Panel aksi. */}
      <div className="flex items-center justify-center px-8 py-14 lg:px-16">
        <div className="w-full max-w-md">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">
            Selamat datang di PKP Hub
          </h1>
          <p className="mt-3 text-muted-foreground text-pretty">
            Dashboard manajemen survey &amp; pengukuran. Masuk dengan akun yang sudah
            terdaftar untuk melanjutkan.
          </p>

          <Button className="mt-8 w-full" size="lg" render={<Link href="/login">Masuk</Link>} />

          <div className="mt-10 space-y-3">
            {AREA.map((area) => (
              <Card key={area.nama}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    {area.nama}
                    <span className="text-xs font-normal text-muted-foreground">{area.untuk}</span>
                  </CardTitle>
                  <CardDescription>{area.deskripsi}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Area Anda ditentukan otomatis oleh role akun setelah masuk.
          </p>
        </div>
      </div>
    </main>
  );
}
```

Catatan untuk implementer:

- Kartu Area **sengaja bukan link.** Keduanya sama-sama menuntut login dan role ditentukan akun, bukan pilihan user — kalau dibuat bisa diklik, keduanya cuma mendarat di `/login` yang sama. Kalimat "Area Anda ditentukan otomatis…" adalah yang menjelaskan hal ini ke user. Jangan "perbaiki" jadi tautan.
- `bg-brand-base` dan `bg-brand-accent` adalah kelas Tailwind yang dihasilkan dari `--color-brand-base` / `--color-brand-accent` di blok `@theme inline` (`app/globals.css:8-10`). Kelasnya sudah tersedia, tidak perlu menambah token.
- Halaman ini `async` dan memanggil `getSession()`, yang membaca `headers()` — jadi ia dinamis (tidak diprerender). Itu memang yang diinginkan: hasilnya bergantung pada session.

- [ ] **Step 2: Typecheck & lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: dua-duanya lolos tanpa error.

- [ ] **Step 3: Verifikasi pengunjung anonim**

Jalankan dev server (`pnpm dev`) kalau belum jalan, lalu:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s http://localhost:3000/ | grep -c "Selamat datang di PKP Hub"
```

Expected: `200`, lalu hitungan `1` (atau lebih) — bukan `0`.

- [ ] **Step 4: Verifikasi redirect user yang sudah login**

Halaman ini adalah server component, jadi redirect-nya hanya bisa dibuktikan dengan session sungguhan — buka browser di `http://localhost:3000`.

Kalau DB belum ter-seed, jalankan `pnpm db:seed` dulu. **Peringatan: seed menghapus tabel `clients`/`projects`/`users` lebih dulu** (lihat `lib/db/seed.ts:29-38`) — jangan jalankan kalau ada data yang mau dipertahankan. Semua akun seed memakai password `password123`.

1. Login sebagai `owner@pkp.test` → buka `http://localhost:3000/` → harus mendarat di `/dashboard`.
2. Logout, login sebagai `andi@klien.test` → buka `http://localhost:3000/` → harus mendarat di `/portal`.
3. Logout → buka `http://localhost:3000/` → harus melihat halaman gerbang, bukan redirect.

- [ ] **Step 5: Verifikasi responsif**

Di DevTools, cek lebar 375px (mobile) dan ≥1024px (desktop):

- 375px: panel brand menumpuk di atas panel aksi; **tidak ada scroll horizontal**.
- ≥1024px: dua kolom sejajar, panel brand di kiri.

- [ ] **Step 6: Jalankan seluruh suite test**

Task 1 mengubah file yang dipakai di mana-mana (`lib/auth-guards.ts`), jadi pastikan tidak ada yang rusak.

```bash
pnpm test
```

Expected: seluruh suite lulus.

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "Homepage: gerbang internal split-screen + redirect berbasis role"
```

---

## Kriteria Selesai (dari spec)

- [ ] Pengunjung anonim di `/` melihat halaman gerbang, bukan placeholder Phase 0. (Task 2 Step 3)
- [ ] Login sebagai `owner@pkp.test`, buka `/` → mendarat di `/dashboard`. (Task 2 Step 4)
- [ ] Login sebagai `andi@klien.test`, buka `/` → mendarat di `/portal`. (Task 2 Step 4)
- [ ] Tombol "Masuk" membawa ke `/login`. (Task 2 Step 4)
- [ ] Layout utuh dari 375px sampai desktop, tanpa scroll horizontal. (Task 2 Step 5)
- [ ] `tsc --noEmit` lolos. (Task 2 Step 2)
