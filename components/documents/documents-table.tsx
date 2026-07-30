"use client";

import type { VisibilityState } from "@tanstack/react-table";
import { type ReactNode, useState } from "react";
import { buildDocumentsColumns, type DocumentRow } from "@/components/documents/documents-columns";
import { DataTable } from "@/components/ui/data-table";
import { TableColumnToggle } from "@/components/ui/table-column-toggle";

/**
 * Thin client wrapper so `buildDocumentsColumns` (whose cell renderers embed
 * client components like `DocumentShareToggle`) is built INSIDE client code
 * — calling it from a Server Component and passing the resulting
 * `ColumnDef[]` (which contains plain functions, not JSX) across the RSC
 * boundary isn't serializable and throws at runtime.
 *
 * Sama dengan `ProjectsTable`: visibilitas kolom dikelola via
 * `TableColumnToggle` (state + localStorage), diteruskan ke `DataTable`
 * lewat prop `columnVisibility`. Kolom `__select__` (bulk) dan `actions`
 * sengaja TIDAK masuk toggle — keduanya adalah kontrol, bukan data.
 */

const CORE_COLUMNS: { id: string; label: string }[] = [
  { id: "name", label: "Nama" },
  { id: "category", label: "Kategori" },
  { id: "fileSize", label: "Ukuran" },
  { id: "uploaderName", label: "Diunggah oleh" },
  { id: "createdAt", label: "Tanggal" },
  { id: "shared", label: "Status" },
];

const CROSS_PROJECT_COLUMNS: { id: string; label: string }[] = [
  { id: "projectTitle", label: "Proyek" },
  { id: "clientName", label: "Klien" },
];

const DEFAULT_VISIBLE: Record<string, boolean> = Object.fromEntries(
  [...CORE_COLUMNS, ...CROSS_PROJECT_COLUMNS].map((c) => [c.id, true]),
);

export function DocumentsTable({
  rows,
  isAdmin,
  showProject = false,
  emptyMessage = "Belum ada dokumen.",
}: {
  rows: DocumentRow[];
  isAdmin: boolean;
  showProject?: boolean;
  emptyMessage?: ReactNode;
}) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_VISIBLE);

  // Toggle entries: hanya kolom yang relevan untuk konteks tabel ini
  // (kolom `Proyek`/`Klien` cuma ada di halaman arsip lintas-proyek).
  const toggleColumns = [...CORE_COLUMNS, ...(showProject ? CROSS_PROJECT_COLUMNS : [])].map(
    (c) => ({
      id: c.id,
      label: c.label,
      visible: columnVisibility[c.id] ?? DEFAULT_VISIBLE[c.id] ?? true,
    }),
  );

  return (
    <DataTable
      columns={buildDocumentsColumns({ isAdmin, showProject })}
      data={rows}
      emptyMessage={emptyMessage}
      searchable
      searchPlaceholder="Cari nama atau proyek…"
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      toolbar={
        <div className="flex w-full justify-end">
          <TableColumnToggle
            columns={toggleColumns}
            onChange={(next) =>
              setColumnVisibility(
                Object.fromEntries(next.map((c) => [c.id, c.visible])) as VisibilityState,
              )
            }
            storageKey="documents-table-columns"
          />
        </div>
      }
    />
  );
}
