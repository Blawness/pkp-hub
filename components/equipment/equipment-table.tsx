"use client";

import type { ReactNode } from "react";
import { EquipmentCardList } from "@/components/equipment/equipment-card-list";
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
  projectOptions,
  surveyors,
  emptyMessage = "Belum ada alat.",
}: {
  rows: EquipmentTableRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
  emptyMessage?: ReactNode;
}) {
  return (
    <>
      <div className="hidden md:block">
        <DataTable
          columns={buildEquipmentColumns({ isAdmin, projectOptions, surveyors })}
          data={rows}
          searchable
          searchPlaceholder="Cari alat…"
          emptyMessage={emptyMessage}
        />
      </div>
      <div className="md:hidden">
        {rows.length === 0 ? (
          emptyMessage
        ) : (
          <EquipmentCardList
            rows={rows}
            isAdmin={isAdmin}
            projectOptions={projectOptions}
            surveyors={surveyors}
          />
        )}
      </div>
    </>
  );
}
