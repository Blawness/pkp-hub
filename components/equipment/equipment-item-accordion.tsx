"use client";

import { ArrowUpRightIcon, ImageIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ArchiveEquipmentButton } from "@/components/equipment/archive-equipment-button";
import { ArchiveEquipmentItemButton } from "@/components/equipment/archive-equipment-item-button";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import { EquipmentFormDialog } from "@/components/equipment/equipment-form-dialog";
import { EquipmentItemFormDialog } from "@/components/equipment/equipment-item-form-dialog";
import { ReturnButton } from "@/components/equipment/return-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  EquipmentCategoryInput,
  EquipmentConditionInput,
} from "@/lib/actions/equipment-schemas";
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
                    <div className="flex shrink-0 items-start gap-2">
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
                      <ArchiveEquipmentItemButton itemId={it.id} itemName={it.name} />
                    </div>
                  ) : null}
                </div>

                {isOpen ? (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    {it.units.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Belum ada unit.</p>
                    ) : (
                      it.units.map((unit) => (
                        // Seluruh kotak adalah link ke detail unit, KECUALI tombol
                        // aksinya. Caranya link overlay (`absolute inset-0`) + tombol
                        // di `z-10` di atasnya — bukan membungkus kotaknya dalam <a>,
                        // karena <button> di dalam <a> itu HTML tidak valid dan bikin
                        // klik "Pinjam"/"Edit" ikut memicu navigasi.
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
                            {/* Badge non-interaktif — sengaja DI LUAR lapis z-10 supaya
                                kliknya tetap tembus ke link overlay di bawahnya. */}
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

                            {/* Quick action: ikon semua. Setiap tombol tetap punya
                                `aria-label` — tooltip itu petunjuk visual saat hover,
                                bukan nama aksesibelnya. */}
                            <div className="relative z-10 flex shrink-0 items-center gap-1">
                              {unit.activeUsage ? (
                                unit.activeUsage.canReturn ? (
                                  <Tooltip>
                                    <ReturnButton
                                      usageId={unit.activeUsage.usageId}
                                      equipmentName={`${it.name} (${unit.code})`}
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
                                      name: `${it.name} (${unit.code})`,
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
                                            {/* Panah keluar / panah balik = pasangan
                                                pinjam-kembali. `HandHelping` tidak
                                                terbaca di ukuran 14px. */}
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
                                      itemId={it.id}
                                      itemName={it.name}
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
                                      equipmentName={`${it.name} (${unit.code})`}
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
