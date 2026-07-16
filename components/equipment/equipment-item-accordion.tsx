"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EquipmentCategoryInput } from "@/lib/actions/equipment-schemas";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

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
  purchasePrice?: number | null;
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
  image: string | null;
  units: EquipmentUnitRow[];
  summary: { total: number; tersedia: number; terpinjam: number; perawatan: number; rusak: number };
};

/**
 * Daftar alat sebagai accordion per JENIS (spec 2026-07-16) — menggantikan
 * `EquipmentTable`/`EquipmentColumns`/`EquipmentCardList`. Satu tampilan untuk
 * semua ukuran layar (kartu accordion, bukan tabel 5 kolom yang butuh
 * rendering terpisah untuk mobile). Expand/collapse murni state klien — tidak
 * disimpan di URL.
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
                    <EquipmentItemFormDialog
                      editing={{
                        itemId: it.id,
                        name: it.name,
                        category: it.category as EquipmentCategoryInput,
                        image: it.image,
                        imageDisplayUrl: it.image,
                      }}
                      trigger={
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      }
                    />
                  ) : null}
                </div>

                {isOpen ? (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    {it.units.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada unit.</p>
                    ) : (
                      it.units.map((unit) => (
                        <div
                          key={unit.id}
                          className="flex flex-col gap-2 rounded-md border border-border p-2 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/equipment/unit/${unit.id}`}
                              className="font-medium hover:underline"
                            >
                              {unit.code}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              {unit.serialNumber ? `SN ${unit.serialNumber}` : "Tanpa no. seri"}
                            </p>
                          </div>

                          <div className="flex items-center justify-between gap-2 sm:justify-end">
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

                            {unit.activeUsage ? (
                              unit.activeUsage.canReturn ? (
                                <ReturnButton
                                  usageId={unit.activeUsage.usageId}
                                  equipmentName={`${it.name} (${unit.code})`}
                                  durationLabel={unit.activeUsage.durationLabel}
                                />
                              ) : null
                            ) : unit.canBorrow ? (
                              <BorrowDialog
                                fixedEquipment={{ id: unit.id, name: `${it.name} (${unit.code})` }}
                                projectOptions={projectOptions}
                                isAdmin={isAdmin}
                                surveyors={surveyors}
                                trigger={
                                  <Button size="sm" variant="outline">
                                    Pinjam
                                  </Button>
                                }
                              />
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}

                    {isAdmin ? (
                      <EquipmentFormDialog
                        itemId={it.id}
                        itemName={it.name}
                        trigger={
                          <Button size="sm" variant="outline" className="w-fit">
                            + Tambah unit
                          </Button>
                        }
                      />
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
    </div>
  );
}
