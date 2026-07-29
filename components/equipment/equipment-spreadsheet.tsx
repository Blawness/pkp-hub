"use client";

import { TableIcon } from "lucide-react";
import { Fragment, type KeyboardEvent } from "react";
import type {
  EquipmentItemAccordionRow,
  EquipmentUnitRow,
} from "@/components/equipment/equipment-unit-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIDR } from "@/lib/format";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Tampilan "Tabel" untuk Inventaris Alat (spesifikasi: 2026-07-29, revisi
 * 2026-07-30 — palette match design system + modal detail row-click).
 *
 * Layout datar mirip spreadsheet: baris header, baris kategori (huruf A., B.,
 * …), lalu per item. Item dengan banyak unit punya baris induk yang
 * menampilkan Jumlah & Total Harga dengan `rowspan` ke baris unit; item
 * dengan satu unit cukup satu baris gabungan.
 *
 * Klik baris UNIT (baris yang punya kode unit) → modal detail yang reuse
 * konten halaman `/dashboard/equipment/unit/[unitId]`. Baris kategori & baris
 * induk item (multi-unit) tidak clickable — tidak ada halaman detail untuk
 * kategori / jenis, dan klik di situ akan terasa ambigu.
 *
 * Kolom harga disembunyikan untuk surveyor (purchasePrice di-strip di level
 * query, lihat `equipment-logic.ts`) — deteksinya lewat ketiadaan field,
 * bukan 0 rupiah. */

type CategoryGroup = {
  /** key kategori DB (mis. "drone") */
  key: string;
  /** label tampil (mis. "Drone") */
  label: string;
  items: EquipmentItemAccordionRow[];
  /** total nilai beli seluruh unit dalam kategori (null untuk surveyor). */
  totalValue: number | null;
};

function priceForUnit(unit: EquipmentUnitRow): number | null {
  if (!("purchasePrice" in unit)) return null;
  return unit.purchasePrice ?? null;
}

function dateForUnit(unit: EquipmentUnitRow): string | null {
  if (!("purchaseDate" in unit)) return null;
  return unit.purchaseDate ?? null;
}

/** `purchasePrice` di-strip dari payload untuk surveyor di level query —
 * ketiadaan field = surveyor, bukan unit bernilai 0. Cukup sampel unit
 * pertama karena sumbernya query yang sama. */
function canSeeCost(units: EquipmentUnitRow[]): boolean {
  if (units.length === 0) return false;
  return "purchasePrice" in units[0];
}

function numberForItem(index: number): string {
  return `${index + 1}.`;
}

function numberForUnit(itemNumber: string, unitIndex: number): string {
  return `${itemNumber}${unitIndex + 1}`;
}

function conditionBadge(condition: string, isActive: boolean) {
  if (isActive) {
    return <Badge>Dipinjam</Badge>;
  }
  const variant =
    condition === "tersedia"
      ? "secondary"
      : condition === "rusak"
        ? "destructive"
        : condition === "perawatan" || condition === "pensiun"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{equipmentConditionLabel[condition] ?? condition}</Badge>;
}

/** Sel harga. Kalau `show=false` (surveyor) tampil strip dengan teks
 * muted; `show=true` (admin) tampil `formatIDR`. `rowspan` dipakai sel
 * Total Harga di baris induk agar merge visual ke baris unit. */
function PriceCell({
  value,
  show,
  rowspan,
  emphasize = false,
}: {
  value: number | null;
  show: boolean;
  rowspan?: number;
  emphasize?: boolean;
}) {
  return (
    <TableCell
      rowSpan={rowspan}
      className={cn(
        "text-right tabular-nums",
        !show && "text-muted-foreground",
        emphasize && "font-semibold",
      )}
    >
      {!show ? "—" : value == null ? "—" : formatIDR(value)}
    </TableCell>
  );
}

function YearCell({ value, show }: { value: string | null; show: boolean }) {
  return (
    <TableCell className={cn("text-center tabular-nums", !show && "text-muted-foreground")}>
      {!show ? "—" : (value ?? "—")}
    </TableCell>
  );
}

/** Baris tabel yang bisa di-klik → membuka modal detail unit. Pakai pola
 * `role="button"` + `tabIndex=0` + handler keyboard, supaya Enter/Space juga
 * memicu (TableRow shadcn bukan `<a>`, jadi tidak bisa pakai overlay Link
 * tanpa markup tabel yang aneh). Cursor + focus ring menandakan interaktif. */
function UnitTableRow({
  unitId,
  className,
  onActivate,
  children,
}: {
  unitId: string;
  className?: string;
  onActivate: (unitId: string) => void;
  children: React.ReactNode;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate(unitId);
    }
  }
  return (
    <TableRow
      role="button"
      tabIndex={0}
      aria-label="Lihat detail unit"
      onClick={() => onActivate(unitId)}
      onKeyDown={handleKeyDown}
      className={cn(
        "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        className,
      )}
    >
      {children}
    </TableRow>
  );
}

export function EquipmentSpreadsheet({
  items,
  isAdmin,
  onUnitClick,
}: {
  items: EquipmentItemAccordionRow[];
  isAdmin: boolean;
  /** Dipanggil saat user mengklik baris unit (bukan baris kategori/induk
   * item). Pemanggil (EquipmentCatalog) yang menampilkan modal detail
   * unit — tabel sendiri tidak mengelola state modal. */
  onUnitClick: (unitId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={TableIcon}
        title="Belum ada alat"
        description="Belum ada jenis alat yang cocok dengan filter saat ini."
      />
    );
  }

  const showCost = canSeeCost(items.flatMap((it) => it.units));

  // Urutan kategori mengikuti urutan kemunculan item pertama
  // (desc(equipmentItem.createdAt) dari query) — konsisten dengan
  // tampilan galeri/daftar.
  const groups: CategoryGroup[] = [];
  const groupIndexByKey = new Map<string, number>();
  for (const item of items) {
    let idx = groupIndexByKey.get(item.category);
    if (idx == null) {
      idx = groups.length;
      groupIndexByKey.set(item.category, idx);
      groups.push({
        key: item.category,
        label: equipmentCategoryLabel[item.category] ?? item.category,
        items: [],
        totalValue: showCost ? 0 : null,
      });
    }
    groups[idx].items.push(item);
    if (showCost) {
      const sum = item.units.reduce((s, u) => s + (priceForUnit(u) ?? 0), 0);
      groups[idx].totalValue = (groups[idx].totalValue ?? 0) + sum;
    }
  }

  // Huruf A., B., C., … mengikuti urutan tampilan. >26 kategori: A1, B1, …
  const categoryLetter = (index: number) => {
    const letter = String.fromCharCode(65 + (index % 26));
    return index < 26 ? letter : `${letter}${Math.floor(index / 26)}`;
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No</TableHead>
              <TableHead>Nama Barang</TableHead>
              <TableHead className="w-32">Jumlah (Set / Unit)</TableHead>
              <TableHead className="w-24 text-center">Tahun Perolehan</TableHead>
              <TableHead className="w-28">Kondisi</TableHead>
              <TableHead className="w-32 text-right">Harga / unit</TableHead>
              <TableHead className="w-36 text-right">Total Harga</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {groups.map((group, gIdx) => {
              const groupLabel = `${categoryLetter(gIdx)}. ${group.label}`;
              return (
                <Fragment key={group.key}>
                  {/* Baris kategori: label di kiri (memanjang), total di kanan.
                      Latar muted agar terpisah dari baris unit. TIDAK clickable
                      (tidak ada halaman detail untuk kategori). */}
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableCell colSpan={6} className="font-semibold text-foreground">
                      {groupLabel}
                    </TableCell>
                    <PriceCell value={group.totalValue} show={showCost} emphasize />
                  </TableRow>

                  {group.items.map((item, iIdx) => {
                    const itemNumber = numberForItem(iIdx);
                    const units = item.units;
                    const itemTotal = showCost
                      ? units.reduce((s, u) => s + (priceForUnit(u) ?? 0), 0)
                      : 0;

                    // Tidak ada unit — satu baris placeholder, juga non-clickable.
                    if (units.length === 0) {
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-muted-foreground">
                            {itemNumber}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{item.name}</TableCell>
                          <TableCell className="text-center text-muted-foreground">—</TableCell>
                          <YearCell value={null} show={showCost} />
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <PriceCell value={null} show={showCost} />
                          <PriceCell value={null} show={showCost} />
                        </TableRow>
                      );
                    }

                    // Satu unit: satu baris clickable ke detail unit itu.
                    if (units.length === 1) {
                      const unit = units[0];
                      const price = showCost ? priceForUnit(unit) : null;
                      return (
                        <UnitTableRow key={item.id} unitId={unit.id} onActivate={onUnitClick}>
                          <TableCell className="font-medium">{itemNumber}</TableCell>
                          <TableCell>
                            <span className="font-medium">{item.name}</span>
                            <span className="ml-2 text-muted-foreground">({unit.code})</span>
                          </TableCell>
                          <TableCell className="text-center tabular-nums">1 unit</TableCell>
                          <YearCell value={dateForUnit(unit)} show={showCost} />
                          <TableCell>
                            {conditionBadge(unit.condition, Boolean(unit.activeUsage))}
                          </TableCell>
                          <PriceCell value={price} show={showCost} />
                          <PriceCell value={price} show={showCost} />
                        </UnitTableRow>
                      );
                    }

                    // Banyak unit: baris induk tidak clickable (tidak ada
                    // halaman detail untuk jenis), tapi tiap sub-baris unit
                    // clickable. Tanda kursor di sub-baris cukup untuk
                    // memberi tahu; baris induk tanpa cursor.
                    return (
                      <Fragment key={item.id}>
                        <TableRow>
                          <TableCell className="align-top font-semibold">{itemNumber}</TableCell>
                          <TableCell className="align-top font-semibold">{item.name}</TableCell>
                          <TableCell className="text-center font-medium tabular-nums">
                            {units.length} unit
                          </TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <TableCell className="text-muted-foreground">—</TableCell>
                          <PriceCell
                            value={itemTotal}
                            show={showCost}
                            rowspan={units.length}
                            emphasize
                          />
                        </TableRow>
                        {units.map((unit, uIdx) => {
                          const price = showCost ? priceForUnit(unit) : null;
                          return (
                            <UnitTableRow
                              key={unit.id}
                              unitId={unit.id}
                              onActivate={onUnitClick}
                              className="bg-muted/30 focus-visible:bg-muted/30"
                            >
                              <TableCell className="pl-6 text-muted-foreground">
                                {numberForUnit(itemNumber, uIdx)}
                              </TableCell>
                              <TableCell>
                                {unit.code}
                                {unit.serialNumber ? (
                                  <span className="ml-2 text-muted-foreground">
                                    (SN {unit.serialNumber})
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-center tabular-nums">1 unit</TableCell>
                              <YearCell value={dateForUnit(unit)} show={showCost} />
                              <TableCell>
                                {conditionBadge(unit.condition, Boolean(unit.activeUsage))}
                              </TableCell>
                              <PriceCell value={price} show={showCost} />
                            </UnitTableRow>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}

            {/* Total keseluruhan di kaki tabel — admin only. */}
            {showCost ? (
              <TableRow className="bg-muted font-semibold hover:bg-muted">
                <TableCell colSpan={6} className="text-right">
                  Total keseluruhan
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatIDR(groups.reduce((s, g) => s + (g.totalValue ?? 0), 0))}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {!isAdmin ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Kolom harga & tahun perolehan hanya terlihat oleh admin. Klik baris unit untuk detail.
        </p>
      ) : (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          Klik baris unit untuk melihat detail & riwayat pakai.
        </p>
      )}
    </Card>
  );
}
