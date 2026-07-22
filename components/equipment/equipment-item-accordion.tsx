"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { ArchiveEquipmentItemButton } from "@/components/equipment/archive-equipment-item-button";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import {
  type EquipmentItemAccordionRow,
  EquipmentUnitList,
} from "@/components/equipment/equipment-unit-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel } from "@/lib/labels";

export type {
  EquipmentItemAccordionRow,
  EquipmentUnitRow,
} from "@/components/equipment/equipment-unit-list";

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
