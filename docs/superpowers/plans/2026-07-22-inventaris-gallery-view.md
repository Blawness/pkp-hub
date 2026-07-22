# Inventaris Gallery/List Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a catalog-style gallery view (default) with a toggle back to the existing accordion/list view on the Inventaris Alat page.

**Architecture:** Pure presentation-layer change. A new client wrapper `EquipmentCatalog` owns the search box + view toggle (ephemeral `useState`, not persisted) and switches between a new `EquipmentGallery` (grid of cards → detail dialog) and the refactored `EquipmentItemAccordion`. The per-unit action rows are extracted into a shared `EquipmentUnitList` so borrow/return/edit logic is not duplicated. The RSC payload (`rows`) is unchanged.

**Tech Stack:** Next.js (App Router, this repo's forked version), React client components, Tailwind v4, shadcn/ui + Base UI (`components/ui/dialog.tsx`), Vitest (node env), Biome.

## Global Constraints

- **No component-test infra exists** — Vitest runs `environment: "node"`, there is no testing-library/jsdom, and there are zero `.test.tsx` files. Only pure functions in `lib/**` are unit-tested (Task 1). Presentation tasks (2–4) verify with `pnpm typecheck` + `pnpm lint`; the final task adds `pnpm build` + a manual smoke checklist. Do **not** add a testing-library dependency.
- **Tests hit a real Neon dev branch.** Run vitest via the repo's env-file pattern: `node --env-file=.env.local node_modules/vitest/vitest.mjs run <file>`.
- **Do not change** the `rows` payload shape, `listEquipmentItemsForUser`, admin-only field trimming, `EquipmentFilters`, `EquipmentSummary`, DB schema, server actions, or auth-guards.
- Code comments/UI copy are in **Indonesian** to match the codebase.
- Biome import ordering is enforced; run `pnpm lint:fix` before committing if needed. Use the existing `// biome-ignore lint/performance/noImgElement:` comment style for uploaded `<img>`.
- Default view is **gallery**; the toggle is **ephemeral** (no URL param, no localStorage).

---

### Task 1: `equipmentStockBadge` pure helper

A catalog card needs one summary status badge derived from the stock counts. This is genuine derivable logic → lives in `lib/equipment/derive.ts` (the codebase's "derived state is computed, never stored" pattern) and is unit-tested.

**Files:**
- Modify: `lib/equipment/derive.ts` (append new export)
- Test: `lib/equipment/derive.test.ts` (append new `describe`)

**Interfaces:**
- Produces: `equipmentStockBadge(summary: { total: number; tersedia: number; terpinjam: number; perawatan: number; rusak: number }): { label: string; variant: "default" | "secondary" | "destructive" | "outline" }`

- [ ] **Step 1: Write the failing test**

Append to `lib/equipment/derive.test.ts`:

```ts
describe("equipmentStockBadge", () => {
  it("ada unit tersedia -> label jumlah tersedia, variant secondary", () => {
    expect(
      equipmentStockBadge({ total: 3, tersedia: 2, terpinjam: 1, perawatan: 0, rusak: 0 }),
    ).toEqual({ label: "2 tersedia", variant: "secondary" });
  });

  it("tidak ada tersedia tapi ada yang dipinjam -> Semua dipinjam, variant default", () => {
    expect(
      equipmentStockBadge({ total: 2, tersedia: 0, terpinjam: 2, perawatan: 0, rusak: 0 }),
    ).toEqual({ label: "Semua dipinjam", variant: "default" });
  });

  it("tidak ada tersedia & tidak ada yang dipinjam -> Tidak tersedia, variant outline", () => {
    expect(
      equipmentStockBadge({ total: 1, tersedia: 0, terpinjam: 0, perawatan: 1, rusak: 0 }),
    ).toEqual({ label: "Tidak tersedia", variant: "outline" });
  });

  it("tanpa unit sama sekali -> Tidak tersedia", () => {
    expect(
      equipmentStockBadge({ total: 0, tersedia: 0, terpinjam: 0, perawatan: 0, rusak: 0 }),
    ).toEqual({ label: "Tidak tersedia", variant: "outline" });
  });
});
```

Add `equipmentStockBadge` to the existing import block at the top of the test file (keep alphabetical order Biome expects):

```ts
import {
  borrowRejection,
  equipmentStockBadge,
  formatDuration,
  summarizeUnits,
  usageDurationMs,
  validateUsageWindow,
} from "@/lib/equipment/derive";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/equipment/derive.test.ts`
Expected: FAIL — `equipmentStockBadge is not a function` / import has no matching export.

- [ ] **Step 3: Write minimal implementation**

Append to `lib/equipment/derive.ts`:

```ts
/**
 * Satu badge status ringkas untuk kartu galeri (spec 2026-07-22). Diturunkan
 * dari agregat `summarizeUnits` — bukan kolom tersimpan. Prioritas: ada yang
 * bisa dipinjam dulu, lalu "semua dipinjam", lalu tidak tersedia (perawatan/
 * rusak/kosong).
 */
export function equipmentStockBadge(summary: {
  total: number;
  tersedia: number;
  terpinjam: number;
  perawatan: number;
  rusak: number;
}): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (summary.tersedia > 0) {
    return { label: `${summary.tersedia} tersedia`, variant: "secondary" };
  }
  if (summary.terpinjam > 0) {
    return { label: "Semua dipinjam", variant: "default" };
  }
  return { label: "Tidak tersedia", variant: "outline" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/equipment/derive.test.ts`
Expected: PASS (all `equipmentStockBadge` cases green, existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add lib/equipment/derive.ts lib/equipment/derive.test.ts
git commit -m "feat(inventaris): equipmentStockBadge() untuk kartu galeri

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extract `EquipmentUnitList` + wire accordion to it

Move the per-unit rows (badge + Pinjam/Kembali/Edit/Hapus quick-actions + "Tambah unit") out of the accordion into a reusable presentational component, and re-point the accordion's expanded body at it. The row types move here too (most-primitive component owns them); the accordion re-exports them so downstream imports don't break yet. List view must look/behave **identically** after this task.

**Files:**
- Create: `components/equipment/equipment-unit-list.tsx`
- Modify: `components/equipment/equipment-item-accordion.tsx`

**Interfaces:**
- Consumes: `EquipmentUnitRow`, `EquipmentItemAccordionRow` (now defined here).
- Produces:
  - `EquipmentUnitList(props: { item: { id: string; name: string }; units: EquipmentUnitRow[]; isAdmin: boolean; projectOptions: { id: string; title: string }[]; surveyors: { id: string; name: string }[] })`
  - `export type EquipmentUnitRow` and `export type EquipmentItemAccordionRow` from this file.

- [ ] **Step 1: Create `equipment-unit-list.tsx`**

Create `components/equipment/equipment-unit-list.tsx` with the full content below. The unit-row JSX is moved verbatim from the accordion (old lines 184–353), with `it.name` → `item.name` and `it.id` → `item.id`:

```tsx
"use client";

import { ArrowUpRightIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { ArchiveEquipmentButton } from "@/components/equipment/archive-equipment-button";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { EquipmentConditionInput } from "@/lib/actions/equipment-schemas";
import { equipmentConditionLabel } from "@/lib/labels";

const conditionVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  tersedia: "secondary",
  perawatan: "outline",
  rusak: "destructive",
  pensiun: "outline",
};

export type EquipmentUnitRow = {
  id: string;
  code: string;
  serialNumber: string | null;
  condition: string;
  // `purchaseDate`/`purchasePrice`/`notes` hanya ada di payload admin —
  // dipangkas di level query untuk surveyor (`equipment-logic.ts`), bukan
  // disembunyikan di render. Form edit unit (admin-only) membutuhkan ketiganya.
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  notes?: string | null;
  activeUsage: {
    usedByName: string;
    projectTitle: string;
    usageId: string;
    canReturn: boolean;
    durationLabel: string;
  } | null;
  canBorrow: boolean;
};

export type EquipmentItemAccordionRow = {
  id: string;
  name: string;
  category: string;
  /**
   * URL presigned untuk DITAMPILKAN saja (`<img src>`), berumur 1 jam. Jangan
   * pernah mengirimkannya balik ke server sebagai nilai yang disimpan — itu
   * yang menjatuhkan halaman ini pada 2026-07-21. Nilai yang disimpan adalah
   * `imageKey`.
   */
  image: string | null;
  /** Alamat objek storage kanonik — satu-satunya bentuk yang boleh ditulis ke DB. */
  imageKey: string | null;
  units: EquipmentUnitRow[];
  summary: { total: number; tersedia: number; terpinjam: number; perawatan: number; rusak: number };
};

/**
 * Daftar unit + aksi cepat (pinjam/kembali/edit/hapus) untuk satu JENIS alat.
 * Diekstrak dari `EquipmentItemAccordion` (spec 2026-07-22) supaya dipakai
 * bersama oleh accordion (list view) dan dialog detail (gallery view) tanpa
 * menduplikasi logika aksinya.
 */
export function EquipmentUnitList({
  item,
  units,
  isAdmin,
  projectOptions,
  surveyors,
}: {
  item: { id: string; name: string };
  units: EquipmentUnitRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {units.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada unit.</p>
      ) : (
        units.map((unit) => (
          // Seluruh kotak adalah link ke detail unit, KECUALI tombol aksinya.
          // Caranya link overlay (`absolute inset-0`) + tombol di `z-10` di
          // atasnya — bukan membungkus kotaknya dalam <a>, karena <button> di
          // dalam <a> itu HTML tidak valid dan bikin klik "Pinjam"/"Edit" ikut
          // memicu navigasi.
          <div
            key={unit.id}
            className="group relative flex flex-col gap-2 rounded-md border border-border p-2 transition-colors hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring sm:flex-row sm:items-center sm:justify-between"
          >
            <Link
              href={`/dashboard/equipment/unit/${unit.id}`}
              className="absolute inset-0 rounded-md focus:outline-none"
            >
              <span className="sr-only">Lihat detail unit {unit.code}</span>
            </Link>

            <div className="min-w-0">
              <p className="font-medium group-hover:underline">{unit.code}</p>
              <p className="text-xs text-muted-foreground">
                {unit.serialNumber ? `SN ${unit.serialNumber}` : "Tanpa no. seri"}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 sm:justify-end">
              {/* Badge non-interaktif — sengaja DI LUAR lapis z-10 supaya kliknya
                  tetap tembus ke link overlay di bawahnya. */}
              {unit.activeUsage ? (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Badge className="w-fit">Terpinjam</Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {unit.activeUsage.usedByName} · {unit.activeUsage.projectTitle}
                  </span>
                </div>
              ) : (
                <Badge variant={conditionVariant[unit.condition] ?? "secondary"}>
                  {equipmentConditionLabel[unit.condition] ?? unit.condition}
                </Badge>
              )}

              {/* Quick action: ikon semua. Setiap tombol tetap punya `aria-label`
                  — tooltip itu petunjuk visual saat hover, bukan nama aksesibelnya. */}
              <div className="relative z-10 flex shrink-0 items-center gap-1">
                {unit.activeUsage ? (
                  unit.activeUsage.canReturn ? (
                    <Tooltip>
                      <ReturnButton
                        usageId={unit.activeUsage.usageId}
                        equipmentName={`${item.name} (${unit.code})`}
                        durationLabel={unit.activeUsage.durationLabel}
                        trigger={
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-sm"
                                variant="outline"
                                aria-label={`Kembalikan ${unit.code}`}
                              >
                                <Undo2Icon />
                              </Button>
                            }
                          />
                        }
                      />
                      <TooltipContent>Kembalikan</TooltipContent>
                    </Tooltip>
                  ) : null
                ) : unit.canBorrow ? (
                  <Tooltip>
                    <BorrowDialog
                      fixedEquipment={{
                        id: unit.id,
                        name: `${item.name} (${unit.code})`,
                      }}
                      projectOptions={projectOptions}
                      isAdmin={isAdmin}
                      surveyors={surveyors}
                      trigger={
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="outline"
                              aria-label={`Pinjam ${unit.code}`}
                            >
                              {/* Panah keluar / panah balik = pasangan pinjam-kembali.
                                  `HandHelping` tidak terbaca di ukuran 14px. */}
                              <ArrowUpRightIcon />
                            </Button>
                          }
                        />
                      }
                    />
                    <TooltipContent>Pinjam</TooltipContent>
                  </Tooltip>
                ) : null}

                {isAdmin ? (
                  <>
                    <Tooltip>
                      <EquipmentFormDialog
                        itemId={item.id}
                        itemName={item.name}
                        editing={{
                          equipmentId: unit.id,
                          code: unit.code,
                          serialNumber: unit.serialNumber,
                          condition: unit.condition as EquipmentConditionInput,
                          purchaseDate: unit.purchaseDate ?? null,
                          purchasePrice: unit.purchasePrice ?? null,
                          notes: unit.notes ?? null,
                        }}
                        trigger={
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-sm"
                                variant="outline"
                                aria-label={`Edit ${unit.code}`}
                              >
                                <PencilIcon />
                              </Button>
                            }
                          />
                        }
                      />
                      <TooltipContent>Edit unit</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <ArchiveEquipmentButton
                        equipmentId={unit.id}
                        equipmentName={`${item.name} (${unit.code})`}
                        trigger={
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon-sm"
                                variant="outline"
                                aria-label={`Hapus ${unit.code}`}
                              >
                                <Trash2Icon />
                              </Button>
                            }
                          />
                        }
                      />
                      <TooltipContent>Hapus unit</TooltipContent>
                    </Tooltip>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))
      )}

      {isAdmin ? (
        <EquipmentFormDialog
          itemId={item.id}
          itemName={item.name}
          trigger={
            <Button size="sm" variant="outline" className="w-fit">
              + Tambah unit
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Refactor the accordion to consume `EquipmentUnitList`**

Rewrite `components/equipment/equipment-item-accordion.tsx` to its new full content below. Changes vs. current: row types now come from `equipment-unit-list` (re-exported for back-compat); the expanded body renders `<EquipmentUnitList/>`; search box + query state and the empty-state map stay **unchanged in this task** (they are lifted in Task 4).

```tsx
"use client";

import { ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArchiveEquipmentItemButton } from "@/components/equipment/archive-equipment-item-button";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import {
  EquipmentUnitList,
  type EquipmentItemAccordionRow,
} from "@/components/equipment/equipment-unit-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel } from "@/lib/labels";

export type { EquipmentUnitRow, EquipmentItemAccordionRow } from "@/components/equipment/equipment-unit-list";

/**
 * Daftar alat sebagai accordion per JENIS (spec 2026-07-16). Baris unit-nya
 * kini ditangani `EquipmentUnitList` (spec 2026-07-22) supaya dipakai bersama
 * dengan gallery view. Expand/collapse murni state klien — tidak disimpan di URL.
 */
export function EquipmentItemAccordion({
  items,
  isAdmin,
  projectOptions,
  surveyors,
  emptyMessage,
}: {
  items: EquipmentItemAccordionRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  emptyMessage: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.units.some(
          (u) =>
            u.code.toLowerCase().includes(q) || (u.serialNumber ?? "").toLowerCase().includes(q),
        ),
    );
  }, [items, query]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cari jenis alat, kode, atau no. seri…"
      />

      {filtered.length === 0
        ? emptyMessage
        : filtered.map((it) => {
            const isOpen = expanded.has(it.id);
            return (
              <Card key={it.id} className="flex flex-col gap-3 p-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(it.id)}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                      {it.image ? (
                        // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis
                        <img src={it.image} alt={it.name} className="size-full object-cover" />
                      ) : (
                        <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{it.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {equipmentCategoryLabel[it.category] ?? it.category}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
                        <span>{it.summary.total} total</span>
                        <span>· {it.summary.tersedia} tersedia</span>
                        <span>· {it.summary.terpinjam} dipinjam</span>
                        {it.summary.perawatan > 0 ? (
                          <span>· {it.summary.perawatan} perawatan</span>
                        ) : null}
                        {it.summary.rusak > 0 ? <span>· {it.summary.rusak} rusak</span> : null}
                      </div>
                    </div>
                  </button>
                  {isAdmin ? (
                    <div className="flex shrink-0 items-start gap-2">
                      <EquipmentItemFormDialog
                        editing={{
                          itemId: it.id,
                          name: it.name,
                          category: it.category as EquipmentCategoryInput,
                          image: it.imageKey,
                          imageDisplayUrl: it.image,
                        }}
                        trigger={
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                        }
                      />
                      <ArchiveEquipmentItemButton itemId={it.id} itemName={it.name} />
                    </div>
                  ) : null}
                </div>

                {isOpen ? (
                  <div className="border-t border-border pt-3">
                    <EquipmentUnitList
                      item={{ id: it.id, name: it.name }}
                      units={it.units}
                      isAdmin={isAdmin}
                      projectOptions={projectOptions}
                      surveyors={surveyors}
                    />
                  </div>
                ) : null}
              </Card>
            );
          })}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS, no errors. (If Biome flags import order, run `pnpm lint:fix` and re-run.)

- [ ] **Step 4: Commit**

```bash
git add components/equipment/equipment-unit-list.tsx components/equipment/equipment-item-accordion.tsx
git commit -m "refactor(inventaris): ekstrak EquipmentUnitList dari accordion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `EquipmentGallery` (catalog grid + detail dialog)

Build the standalone gallery view: a responsive card grid where each card opens a Base UI dialog containing the item's `EquipmentUnitList` plus admin item-level actions. Not wired into the page yet — verified via typecheck/lint.

**Files:**
- Create: `components/equipment/equipment-gallery.tsx`

**Interfaces:**
- Consumes: `EquipmentItemAccordionRow`, `EquipmentUnitList` (Task 2); `equipmentStockBadge` (Task 1).
- Produces: `EquipmentGallery(props: { items: EquipmentItemAccordionRow[]; isAdmin: boolean; projectOptions: { id: string; title: string }[]; surveyors: { id: string; name: string }[] })`

- [ ] **Step 1: Create `equipment-gallery.tsx`**

Create `components/equipment/equipment-gallery.tsx`:

```tsx
"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { ArchiveEquipmentItemButton } from "@/components/equipment/archive-equipment-item-button";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import {
  type EquipmentItemAccordionRow,
  EquipmentUnitList,
} from "@/components/equipment/equipment-unit-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentStockBadge } from "@/lib/equipment/derive";
import { equipmentCategoryLabel } from "@/lib/labels";

/**
 * Gallery view bergaya katalog (spec 2026-07-22). Kartu = tampilan saja; klik
 * membuka dialog berisi daftar unit + aksi (lewat `EquipmentUnitList`) supaya
 * grid tetap rapih. Dialog dikontrol satu state `openId` — dialog aksi di dalam
 * `EquipmentUnitList` (Base UI, ter-portal) bersarang tanpa menutup yang luar.
 */
export function EquipmentGallery({
  items,
  isAdmin,
  projectOptions,
  surveyors,
}: {
  items: EquipmentItemAccordionRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const active = items.find((it) => it.id === openId) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((it) => {
          const badge = equipmentStockBadge(it.summary);
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => setOpenId(it.id)}
              className="group block h-full w-full rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full gap-0 p-0 transition-colors group-hover:border-ring">
                <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden border-b border-border bg-muted">
                  {it.image ? (
                    // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis
                    <img
                      src={it.image}
                      alt={it.name}
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="flex flex-col gap-1 p-3">
                  <p className="truncate font-medium">{it.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {equipmentCategoryLabel[it.category] ?? it.category}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {it.summary.total} unit · {it.summary.tersedia} tersedia
                  </p>
                  <Badge variant={badge.variant} className="mt-1 w-fit">
                    {badge.label}
                  </Badge>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        {active ? (
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                  {active.image ? (
                    // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis
                    <img src={active.image} alt={active.name} className="size-full object-cover" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate">{active.name}</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    {equipmentCategoryLabel[active.category] ?? active.category}
                  </p>
                </div>
              </div>
            </DialogHeader>

            {isAdmin ? (
              <div className="flex flex-wrap gap-2">
                <EquipmentItemFormDialog
                  editing={{
                    itemId: active.id,
                    name: active.name,
                    category: active.category as EquipmentCategoryInput,
                    image: active.imageKey,
                    imageDisplayUrl: active.image,
                  }}
                  trigger={
                    <Button variant="outline" size="sm">
                      Edit jenis
                    </Button>
                  }
                />
                <ArchiveEquipmentItemButton itemId={active.id} itemName={active.name} />
              </div>
            ) : null}

            <EquipmentUnitList
              item={{ id: active.id, name: active.name }}
              units={active.units}
              isAdmin={isAdmin}
              projectOptions={projectOptions}
              surveyors={surveyors}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (If Biome reorders imports, run `pnpm lint:fix`.)

- [ ] **Step 3: Commit**

```bash
git add components/equipment/equipment-gallery.tsx
git commit -m "feat(inventaris): EquipmentGallery katalog + dialog detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `EquipmentCatalog` wrapper + lift search + wire page (default gallery)

Add the wrapper that owns the shared search box + view toggle (default gallery) and the shared empty-state, remove the now-duplicated search/empty from the accordion, and point the page at the wrapper. This is the task that makes the feature live.

**Files:**
- Create: `components/equipment/equipment-catalog.tsx`
- Modify: `components/equipment/equipment-item-accordion.tsx` (drop internal search box, query state, and empty-state map)
- Modify: `app/dashboard/equipment/page.tsx` (render `EquipmentCatalog`)

**Interfaces:**
- Consumes: `EquipmentGallery` (Task 3), `EquipmentItemAccordion` (Task 2), `EquipmentItemAccordionRow`.
- Produces: `EquipmentCatalog(props: { items: EquipmentItemAccordionRow[]; isAdmin: boolean; projectOptions: { id: string; title: string }[]; surveyors: { id: string; name: string }[]; emptyMessage: ReactNode })`
- After this task the accordion's props are unchanged **except** `emptyMessage` is removed and it expects **already-filtered** `items`.

- [ ] **Step 1: Create `equipment-catalog.tsx`**

Create `components/equipment/equipment-catalog.tsx`:

```tsx
"use client";

import { LayoutGridIcon, Rows3Icon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { EquipmentGallery } from "@/components/equipment/equipment-gallery";
import { EquipmentItemAccordion } from "@/components/equipment/equipment-item-accordion";
import type { EquipmentItemAccordionRow } from "@/components/equipment/equipment-unit-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CatalogView = "gallery" | "list";

/**
 * Pembungkus Inventaris Alat (spec 2026-07-22): memegang kotak search + toggle
 * gallery/list yang dipakai bersama kedua tampilan. `view` default "gallery"
 * dan sengaja TIDAK dipersist (bukan URL, bukan localStorage) — state sesaat.
 * Filter kategori/status tetap di `EquipmentFilters` (URL), terpisah dari sini.
 */
export function EquipmentCatalog({
  items,
  isAdmin,
  projectOptions,
  surveyors,
  emptyMessage,
}: {
  items: EquipmentItemAccordionRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  emptyMessage: ReactNode;
}) {
  const [view, setView] = useState<CatalogView>("gallery");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.units.some(
          (u) =>
            u.code.toLowerCase().includes(q) || (u.serialNumber ?? "").toLowerCase().includes(q),
        ),
    );
  }, [items, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari jenis alat, kode, atau no. seri…"
          className="min-w-48 flex-1"
        />
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          <Button
            size="icon-sm"
            variant={view === "gallery" ? "default" : "ghost"}
            aria-label="Tampilan galeri"
            aria-pressed={view === "gallery"}
            onClick={() => setView("gallery")}
          >
            <LayoutGridIcon />
          </Button>
          <Button
            size="icon-sm"
            variant={view === "list" ? "default" : "ghost"}
            aria-label="Tampilan daftar"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <Rows3Icon />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        emptyMessage
      ) : view === "gallery" ? (
        <EquipmentGallery
          items={filtered}
          isAdmin={isAdmin}
          projectOptions={projectOptions}
          surveyors={surveyors}
        />
      ) : (
        <EquipmentItemAccordion
          items={filtered}
          isAdmin={isAdmin}
          projectOptions={projectOptions}
          surveyors={surveyors}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Strip search/empty from the accordion**

Edit `components/equipment/equipment-item-accordion.tsx` so it no longer owns the search box, `query` state, `useMemo` filter, or `emptyMessage` — it now receives already-filtered `items` and always maps them. Apply these exact edits:

Replace the imports line `import { useMemo, useState } from "react";` with:

```tsx
import { useState } from "react";
```

Remove the now-unused `Input` import and the `ReactNode` import. The React/type import region at the top should read:

```tsx
"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { ArchiveEquipmentItemButton } from "@/components/equipment/archive-equipment-item-button";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import {
  EquipmentUnitList,
  type EquipmentItemAccordionRow,
} from "@/components/equipment/equipment-unit-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel } from "@/lib/labels";

export type { EquipmentUnitRow, EquipmentItemAccordionRow } from "@/components/equipment/equipment-unit-list";
```

Change the function signature to drop `emptyMessage`:

```tsx
export function EquipmentItemAccordion({
  items,
  isAdmin,
  projectOptions,
  surveyors,
}: {
  items: EquipmentItemAccordionRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => {
        const isOpen = expanded.has(it.id);
        return (
```

…and update the closing of the map/JSX accordingly (the outer wrapper no longer has the `<Input>` nor the `filtered.length === 0 ? emptyMessage :` ternary — it maps `items` directly). The trailing JSX after the last `</Card>` becomes:

```tsx
        );
      })}
    </div>
  );
}
```

Concretely: delete the `<Input .../>` element, delete the `{filtered.length === 0 ? emptyMessage : filtered.map((it) => {` opener (replace with `{items.map((it) => {`), and delete the `const [query, setQuery] = useState("");` + `const filtered = useMemo(...)` block. Everything inside the map body (the `<Card>…</Card>`) is unchanged from Task 2.

- [ ] **Step 3: Wire the page to `EquipmentCatalog`**

Edit `app/dashboard/equipment/page.tsx`.

Replace the import block (current lines 5–9):

```tsx
import {
  EquipmentItemAccordion,
  type EquipmentItemAccordionRow,
} from "@/components/equipment/equipment-item-accordion";
```

with:

```tsx
import { EquipmentCatalog } from "@/components/equipment/equipment-catalog";
import type { EquipmentItemAccordionRow } from "@/components/equipment/equipment-unit-list";
```

Replace the `<EquipmentItemAccordion ... />` element (current lines 141–164) with:

```tsx
      <EquipmentCatalog
        items={rows}
        isAdmin={isAdmin}
        projectOptions={projectOptions}
        surveyors={surveyors}
        emptyMessage={
          <EmptyState
            icon={WrenchIcon}
            title={hasActiveFilter ? "Tidak ada alat yang cocok dengan filter" : "Belum ada alat"}
            description={
              hasActiveFilter
                ? "Coba ubah atau hapus filter yang aktif."
                : isAdmin
                  ? "Tambahkan jenis alat pertama untuk mulai mencatat unit & pemakaiannya."
                  : "Belum ada alat yang terdaftar."
            }
            action={
              isAdmin && !hasActiveFilter ? (
                <EquipmentItemFormDialog trigger={<Button size="sm">Tambah jenis alat</Button>} />
              ) : undefined
            }
          />
        }
      />
```

(The `EmptyState`, `WrenchIcon`, `EquipmentItemFormDialog`, and `Button` imports already exist in this file — no import changes beyond the two lines above.)

- [ ] **Step 4: Typecheck, lint, build**

Run: `pnpm typecheck && pnpm lint && pnpm build`
Expected: all PASS. `pnpm build` also validates env via `env.ts`; if it fails only on missing env (not on our code), note it and fall back to `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Manual smoke test**

Start `pnpm dev`, log in as admin, open `/dashboard/equipment`, and confirm:
1. Page opens in **gallery view** by default; cards show photo/name/category/stock + status badge.
2. Toggle to **list** (Rows icon) shows the accordion; toggle back to gallery works; active toggle button is visually highlighted.
3. Typing in search filters cards in **both** views; category/status filter chips (`EquipmentFilters`) still work alongside search.
4. Click a gallery card → dialog opens with the unit list. From inside the dialog: **Pinjam** a tersedia unit, **Kembalikan** a borrowed one, **Edit unit**, **Tambah unit**, **Edit jenis**, **Arsip jenis** — each opens its nested dialog, submits, and the outer dialog stays sane (no stuck backdrop/focus).
5. Apply a filter that matches nothing (or search gibberish) → shared empty-state renders in both views.
6. Log in as a **surveyor**: gallery shows only borrowable stock, no admin buttons (Edit jenis/Arsip/Tambah unit/Edit unit absent), Pinjam still available.

- [ ] **Step 6: Commit**

```bash
git add components/equipment/equipment-catalog.tsx components/equipment/equipment-item-accordion.tsx app/dashboard/equipment/page.tsx
git commit -m "feat(inventaris): toggle gallery/list, default gallery

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Wrapper owns view+query, default gallery, ephemeral → Task 4 ✅
- Search lifted to wrapper, shared by both views → Task 4 ✅
- Shared empty-state → Task 4 ✅
- Toolbar with search + 2-button toggle + aria → Task 4 ✅
- `EquipmentUnitList` extraction, no duplicated borrow/edit logic → Task 2 ✅
- Gallery grid + card + detail dialog, nested dialogs → Task 3 ✅
- Stock badge (derived) → Task 1 ✅
- Accordion refactor: uses unit-list, drops internal search/empty, keeps expanded state → Tasks 2 & 4 ✅
- Page wiring, `rows` payload unchanged → Task 4 ✅
- Types single-sourced in `equipment-unit-list`, page import path updated, only importer was page.tsx (verified) ✅
- Risks called out in spec (nested dialog, toggle a11y) covered by manual step 4 + `aria-pressed`/`aria-label` ✅

**Placeholder scan:** No TBD/TODO; all steps carry full code or exact edit instructions.

**Type consistency:** `EquipmentUnitList`, `EquipmentItemAccordionRow`, `EquipmentUnitRow`, `equipmentStockBadge` return shape (`{ label; variant }` with the 4 Badge variants), and all component prop shapes are consistent across Tasks 1–4 and match the current `page.tsx` `rows` construction.
