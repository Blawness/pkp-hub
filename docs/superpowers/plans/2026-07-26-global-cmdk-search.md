# Global Cmd-K Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Satu palette Cmd/Ctrl-K di shell `/dashboard` yang melompat ke klien, proyek, atau dokumen mana pun berdasarkan kecocokan judul/nama — menggantikan navigasi sidebar + filter untuk sebagian besar alur "cari sesuatu".

**Architecture:** Server action terpusat (`globalSearch`) yang menerima satu `q` dan mengembalikan baris tipis (id, label, kind, href) dari tiga tabel yang sudah ada — `clients`, `projects`, `documents` — masing-masing dibatasi oleh RBAC yang sama dengan halaman detailnya. Klien hanya menerima daftar permission-nya (sudah ada via `PermissionsProvider`); palette memutuskan apakah akan membuka route berdasarkan kind. Data diambil on-demand saat palette dibuka; tidak ada indeks penuh, hanya `ILIKE` berindeks pada kolom yang sudah terindeks di `lib/db/schema.ts` (nama, judul, nama file).

**Tech Stack:** cmdk (shadcn `Command`), react-hook-form-free, next-safe-action, Drizzle `ilike` + `or`, Vitest.

## Global Constraints

- Bahasa UI: **Indonesia**. Placeholder palette: "Cari klien, proyek, atau dokumen…".
- Palette ini TIDAK boleh bocorkan baris yang tidak boleh diakses pemanggil. Setiap kind di-filter dengan permission yang sama dengan halaman detailnya (`client.read`, `project.read`, `document.read`).
- Klien portal TIDAK memakai palette ini di v1 — fokus `/dashboard` saja. `app/portal/layout.tsx` tidak diubah.
- Jangan menambah dependensi baru selain `cmdk`; shadcn sudah menghasilkan wrapper-nya.
- Lint/format: `npm run lint:fix`. Typecheck: `npm run typecheck`. Test: `npm test`.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `lib/actions/search-schemas.ts` (create) | Skema `{ q: string().min(1).max(80) }`. |
| `lib/actions/search.ts` (create) | Server action `globalSearch` — `rbacActionClient` + permission agregat `search.use`. |
| `lib/actions/search-logic.ts` (create) | `globalSearchForUser(ctx, q)` — 3 query ILIKE paralel, gabung, sort by recency, slice 20. |
| `lib/actions/search.test.ts` (create) | Test scoping: admin lihat semua, surveyor hanya proyek assigned + klien/dokumen yang terlihat, klien hanya data miliknya. |
| `lib/rbac/resources/search.ts` (create) | Resource `search` dengan satu permission `search.use` (granted untuk `admin` & `surveyor` saja di role matrix). |
| `lib/rbac/resources/index.ts` (modify) | Daftarkan `search`. |
| `lib/rbac/role-matrix.ts` (modify — atau file setara) | Tambah `search.use` ke role `admin` & `surveyor`. |
| `components/search/global-search-palette.tsx` (create) | cmdk wrapper; render hasil dengan grouping "Klien / Proyek / Dokumen"; Enter → router.push(href). |
| `components/search/global-search-trigger.tsx` (create) | Tombol di topbar; "⌘K" hint. |
| `components/dashboard/topbar.tsx` (modify) | Mount trigger. |
| `app/dashboard/layout.tsx` (modify) | Mount palette. |

---

### Task 1: Resource + permission `search.use`

**Files:**
- Create: `lib/rbac/resources/search.ts`
- Modify: `lib/rbac/resources/index.ts`
- Modify: role matrix (cek namanya dengan `grep -r "client:read" lib/rbac`)

**Interfaces:**
- Resource shape mengikuti `lib/rbac/define-resource.ts`. Tidak butuh `table` (bukan sumber data tunggal); pakai `table: null as unknown as object` atau sesuaikan tipe jika linter menolak.
- Permission: `"search.use"`.

- [ ] **Step 1: Tulis resource baru**

```ts
// lib/rbac/resources/search.ts
import { defineResource } from "../define-resource";

export const searchResource = defineResource({
  name: "search",
  table: null as unknown as object, // lihat catatan di define-resource.ts
  permissions: ["search.use"] as const,
  grants: {
    admin: ["search.use"],
    surveyor: ["search.use"],
  },
});
```

- [ ] **Step 2: Daftarkan di registry**

Edit `lib/rbac/resources/index.ts`: import + tambahkan `search: searchResource` ke `RESOURCES`.

- [ ] **Step 3: Jalankan test yang sudah ada**

Run: `npm test -- lib/rbac/resources/index.test.ts`
Expected: PASS (registry tests akan menangkap salah ketik / duplikat).

- [ ] **Step 4: Commit**

```bash
git add lib/rbac/resources/search.ts lib/rbac/resources/index.ts
git commit -m "feat(rbac): add search.use permission"
```

---

### Task 2: Server action `globalSearch` + logika

**Files:**
- Create: `lib/actions/search-schemas.ts`
- Create: `lib/actions/search-logic.ts`
- Create: `lib/actions/search.ts`

**Interfaces:**
- Input: `{ q: string }` (1–80 char, trim, lowercased sebelum query).
- Output: `{ results: Array<{ kind: "client" | "project" | "document"; id: string; label: string; sub: string; href: string }> }`.
- Cap: 20 item total, 8 per kind, sisanya by recency global.

- [ ] **Step 1: Skema**

```ts
// lib/actions/search-schemas.ts
import { z } from "zod";
export const globalSearchInputSchema = z.object({
  q: z.string().trim().min(1).max(80),
});
```

- [ ] **Step 2: Logic dengan scoping RBAC**

`globalSearchForUser(ctx, q)` melakukan tiga paralel:

1. **Clients** — `db.select({...}).from(clients).where(or(ilike(clients.name, `%${q}%`), ilike(clients.email, ...)))` difilter `ctx.permissions` (`client.read` all/assigned/own) → `rbacFilter(ctx, 'client.read', ...)` (cek helper di `lib/rbac/filter.ts`).
2. **Projects** — `or(ilike(projects.title, ...), ilike(projects.locationAddress, ...))` + filter surveyor-assigned.
3. **Documents** — `ilike(documents.fileName, ...)` hanya jika document visible (cek helper yang dipakai `/dashboard/documents`).

Untuk surveyor, `client.read` mungkin tidak ada — empty list. Untuk admin, semua terlihat.

- [ ] **Step 3: Tulis action**

```ts
// lib/actions/search.ts
"use server";
import { rbacActionClient } from "./safe-action";
import { globalSearchInputSchema } from "./search-schemas";
import { globalSearchForUser } from "./search-logic";

export const globalSearch = rbacActionClient
  .metadata({ permission: "search.use" })
  .inputSchema(globalSearchInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const results = await globalSearchForUser(ctx.rbac, parsedInput.q);
    return { success: true as const, results };
  });
```

- [ ] **Step 4: Commit**

```bash
git add lib/actions/search-schemas.ts lib/actions/search-logic.ts lib/actions/search.ts
git commit -m "feat(search): global search action across clients/projects/documents"
```

---

### Task 3: Test scoping

**Files:**
- Create: `lib/actions/search.test.ts`

- [ ] **Step 1: Tulis test untuk 3 role**

Seed: 2 klien (A, B), 3 proyek (P1 assigned surveyor S, P2 assigned surveyor lain, P3 unassigned), 2 dokumen.

Cases:
- Admin → semua 3 proyek + 2 klien + 2 dokumen muncul untuk `q="P"`.
- Surveyor S → hanya P1, hanya klien yang punya P1 (lewat join).
- Surveyor non-S → hanya P2.
- Klien → 0 hasil (tidak ada `search.use`).

- [ ] **Step 2: Run, fix sampai PASS**

```bash
npm test -- lib/actions/search.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/search.test.ts
git commit -m "test(search): cover rbac scoping for global search"
```

---

### Task 4: Palette UI

**Files:**
- Create: `components/search/global-search-palette.tsx`
- Create: `components/search/global-search-trigger.tsx`
- Modify: `components/dashboard/topbar.tsx`
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Tambah shadcn Command jika belum ada**

```bash
pnpm dlx shadcn@latest add command
```

(ikuti wrapper yang dipakai codebase.)

- [ ] **Step 2: Trigger di topbar**

Tombol:

```tsx
<Button variant="outline" size="sm" onClick={() => setOpen(true)}>
  <SearchIcon /> Cari…
  <kbd className="ml-2 text-xs opacity-60">⌘K</kbd>
</Button>
```

- [ ] **Step 3: Palette component (client component)**

- `useState(open)` + `useEffect` listener `keydown` untuk `Cmd/Ctrl+K`.
- Debounced fetch (200ms) ke `globalSearch`.
- `cmdk.Command` dengan grouping `cmdk.Group heading="Klien"`, dst.
- `onSelect` → `router.push(href)`.
- Empty state: "Tidak ada hasil untuk "{q}"".
- Loading state: spinner kecil di kanan.

- [ ] **Step 4: Mount di layout dashboard**

`<GlobalSearchPalette />` di `app/dashboard/layout.tsx`, di dalam `<PermissionsProvider>` agar permission tersedia jika palette perlu gating tambahan di klien.

- [ ] **Step 5: Test manual Playwright (sudah ada di repo)**

```bash
npm run e2e -- global-search.spec.ts
```

Tulis `e2e/global-search.spec.ts`: admin login → tekan Ctrl+K → ketik "P" → enter → URL mengandung `/dashboard/projects/...`.

- [ ] **Step 6: Commit**

```bash
git add components/search components/dashboard/topbar.tsx app/dashboard/layout.tsx e2e/global-search.spec.ts
git commit -m "feat(search): cmd-k palette in dashboard topbar"
```

---

## Acceptance Criteria

- [ ] `Cmd/Ctrl+K` di halaman dashboard manapun membuka palette.
- [ ] Surveyor tidak melihat proyek yang tidak di-assign.
- [ ] Klien tidak bisa memakai palette (route tidak di-mount, action fail-closed).
- [ ] `npm run typecheck` & `npm run lint` bersih.
- [ ] E2E `global-search.spec.ts` PASS.
