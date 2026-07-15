"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIDR } from "@/lib/format";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

export type EquipmentTableRow = {
  id: string;
  name: string;
  category: string;
  serialNumber: string | null;
  condition: string;
  /** URL tampilan gambar (sudah di-resolve di server), atau `null`. */
  image: string | null;
  /** `undefined` untuk surveyor — kolomnya sendiri disembunyikan lewat `isAdmin`, tapi ini menjaga bentuknya juga tidak terpasang. */
  purchasePrice?: number | null;
  activeUsage: { usedByName: string; projectTitle: string } | null;
};

const conditionVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  tersedia: "secondary",
  perawatan: "outline",
  rusak: "destructive",
  pensiun: "outline",
};

/**
 * `isAdmin` gates the purchase-price column. Untuk surveyor, field-nya
 * memang sudah tidak ada di baris (dipangkas di `equipment-logic.ts`) — flag
 * ini hanya mengatur LAYOUT tabel, bukan penyaringan datanya.
 */
export function buildEquipmentColumns({
  isAdmin,
}: {
  isAdmin: boolean;
}): ColumnDef<EquipmentTableRow, unknown>[] {
  const columns: ColumnDef<EquipmentTableRow, unknown>[] = [
    {
      accessorKey: "name",
      header: "Nama",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {row.original.image ? (
              // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis yang bisa dioptimasi
              <img
                src={row.original.image}
                alt={row.original.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            )}
          </div>
          <Link
            href={`/dashboard/equipment/${row.original.id}`}
            className="font-medium hover:underline"
          >
            {row.original.name}
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Kategori",
      cell: ({ row }) => equipmentCategoryLabel[row.original.category] ?? row.original.category,
    },
    {
      accessorKey: "serialNumber",
      header: "No. Seri",
      cell: ({ row }) => row.original.serialNumber ?? "—",
    },
    {
      id: "status",
      header: "Status",
      // Satu status gabungan: sesi pinjam aktif MENIMPA kondisi fisik — alat yang
      // sedang dipakai tampil "Terpinjam", bukan "Tersedia". Saat bebas, jatuh
      // kembali ke kondisi fisik (Tersedia/Perawatan/Rusak/Pensiun).
      cell: ({ row }) => {
        const usage = row.original.activeUsage;
        if (usage) {
          return (
            <div className="flex flex-col gap-0.5">
              <Badge>Terpinjam</Badge>
              <span className="text-xs text-muted-foreground">
                {usage.usedByName} · {usage.projectTitle}
              </span>
            </div>
          );
        }
        return (
          <Badge variant={conditionVariant[row.original.condition] ?? "secondary"}>
            {equipmentConditionLabel[row.original.condition] ?? row.original.condition}
          </Badge>
        );
      },
    },
  ];

  if (isAdmin) {
    columns.push({
      accessorKey: "purchasePrice",
      header: "Harga beli",
      cell: ({ row }) => formatIDR(row.original.purchasePrice),
    });
  }

  return columns;
}
