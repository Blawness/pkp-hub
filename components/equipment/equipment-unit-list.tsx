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
