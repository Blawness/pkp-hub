"use client";

import { LayoutGridIcon, Rows3Icon, TableIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { EquipmentGallery } from "@/components/equipment/equipment-gallery";
import { EquipmentItemAccordion } from "@/components/equipment/equipment-item-accordion";
import { EquipmentSpreadsheet } from "@/components/equipment/equipment-spreadsheet";
import { EquipmentUnitDetailModal } from "@/components/equipment/equipment-unit-detail-modal";
import type { EquipmentItemAccordionRow } from "@/components/equipment/equipment-unit-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CatalogView = "gallery" | "list" | "table";

/**
 * Pembungkus Inventaris Alat (spec 2026-07-22, diperbarui 2026-07-29 dengan
 * tampilan "Tabel" / spreadsheet-style, dan 2026-07-30 dengan modal detail
 * terpusat). Memegang:
 * - kotak search + toggle gallery/list/tabel
 * - state modal detail unit (satu modal dipakai bersama oleh ketiga view)
 *
 * `view` default "gallery" dan sengaja TIDAK dipersist (bukan URL, bukan
 * localStorage) — state sesaat. Filter kategori/status tetap di
 * `EquipmentFilters` (URL), terpisah dari sini.
 *
 * `openUnitId` sengaja state sesi (bukan URL) — modal adalah overlay, bukan
 * halaman. Tombol back/forward tidak menutup modal; user menutup dengan X /
 * Esc / klik di luar.
 */
export function EquipmentCatalog({
  items,
  isAdmin,
  projectOptions,
  surveyors,
  currentUserId,
  emptyMessage,
}: {
  items: EquipmentItemAccordionRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  currentUserId: string;
  emptyMessage: ReactNode;
}) {
  const [view, setView] = useState<CatalogView>("gallery");
  const [query, setQuery] = useState("");
  // null = modal tertutup. String = id unit yang sedang ditampilkan.
  // Diletakkan di sini (bukan di masing-masing view) supaya:
  // 1. semua view pakai modal yang SAMA — tidak ada drift visual
  // 2. pindah view (gallery → table) tidak menutup modal
  // 3. modal share state refetch & revalidation yang sama
  const [openUnitId, setOpenUnitId] = useState<string | null>(null);

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
        {/* biome-ignore lint/a11y/useSemanticElements: segmented toggle ikon, bukan grup field form — <fieldset> tidak tepat di sini */}
        <div
          role="group"
          aria-label="Ganti tampilan"
          className="flex items-center gap-1 rounded-md border border-border p-0.5"
        >
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
          <Button
            size="icon-sm"
            variant={view === "table" ? "default" : "ghost"}
            aria-label="Tampilan tabel"
            aria-pressed={view === "table"}
            onClick={() => setView("table")}
          >
            <TableIcon />
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
          onUnitClick={setOpenUnitId}
        />
      ) : view === "list" ? (
        <EquipmentItemAccordion
          items={filtered}
          isAdmin={isAdmin}
          projectOptions={projectOptions}
          surveyors={surveyors}
          onUnitClick={setOpenUnitId}
        />
      ) : (
        <EquipmentSpreadsheet items={filtered} isAdmin={isAdmin} onUnitClick={setOpenUnitId} />
      )}

      <EquipmentUnitDetailModal
        unitId={openUnitId}
        open={openUnitId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenUnitId(null);
        }}
        isAdmin={isAdmin}
        projectOptions={projectOptions}
        surveyors={surveyors}
        currentUserId={currentUserId}
      />
    </div>
  );
}
