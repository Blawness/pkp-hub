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
