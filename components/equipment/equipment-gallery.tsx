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
          // Seluruh kartu = satu <button>. Isi Card WAJIB non-interaktif
          // (gambar/teks/Badge) — menaruh tombol/link di dalamnya bikin
          // nested interactive HTML yang tidak valid. Aksi ada di dialog.
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
