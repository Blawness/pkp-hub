"use client";

import type { ColumnDef } from "@tanstack/react-table";
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
        <Link
          href={`/dashboard/equipment/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.original.name}
        </Link>
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
      accessorKey: "condition",
      header: "Kondisi",
      cell: ({ row }) => (
        <Badge variant={conditionVariant[row.original.condition] ?? "secondary"}>
          {equipmentConditionLabel[row.original.condition] ?? row.original.condition}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status pakai",
      cell: ({ row }) =>
        row.original.activeUsage ? (
          <span className="text-sm">
            Dipakai · {row.original.activeUsage.usedByName} ({row.original.activeUsage.projectTitle}
            )
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Tersedia</span>
        ),
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
