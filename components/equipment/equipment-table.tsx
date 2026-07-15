"use client";

import type { ReactNode } from "react";
import {
  buildEquipmentColumns,
  type EquipmentTableRow,
} from "@/components/equipment/equipment-columns";
import { DataTable } from "@/components/ui/data-table";

/**
 * Thin client wrapper — sama alasan dengan `DocumentsTable`: kolomnya
 * dibangun dengan cell renderer JSX, yang tidak bisa lewat batas
 * server->client sebagai prop dari Server Component.
 */
export function EquipmentTable({
  rows,
  isAdmin,
  toolbar,
  emptyMessage = "Belum ada alat.",
}: {
  rows: EquipmentTableRow[];
  isAdmin: boolean;
  toolbar?: ReactNode;
  emptyMessage?: ReactNode;
}) {
  return (
    <DataTable
      columns={buildEquipmentColumns({ isAdmin })}
      data={rows}
      searchable
      searchPlaceholder="Cari alat…"
      toolbar={toolbar}
      emptyMessage={emptyMessage}
    />
  );
}
