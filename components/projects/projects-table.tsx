"use client";

import type { VisibilityState } from "@tanstack/react-table";
import { useState } from "react";
import { BulkActions } from "@/components/projects/bulk-actions";
import type { ProjectRow } from "@/components/projects/projects-columns";
import { projectsColumns } from "@/components/projects/projects-columns";
import { DataTable } from "@/components/ui/data-table";
import { TableColumnToggle } from "@/components/ui/table-column-toggle";
import { can } from "@/lib/rbac/can";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Wrapper klien untuk tabel proyek + bulk actions.
 * Dipisah dari Server Component supaya state selection tetap hidup.
 *
 * Toggle visibilitas kolom memakai `TableColumnToggle` (state + localStorage
 * di komponen itu) dan diteruskan ke `DataTable` lewat prop
 * `columnVisibility` / `onColumnVisibilityChange`. `id` kolom di sini HARUS
 * cocok dengan `accessorKey`/`id` di `projectsColumns` — lihat
 * `PROJECT_COLUMN_TOGGLE` di bawah.
 */

const PROJECT_COLUMN_TOGGLE: { id: string; label: string }[] = [
  { id: "title", label: "Judul" },
  { id: "clientName", label: "Klien" },
  { id: "surveyType", label: "Jenis" },
  { id: "surveyorName", label: "Surveyor" },
  { id: "status", label: "Status" },
  { id: "orderDate", label: "Tanggal order" },
];

/** Bentuk awal untuk `TableColumnToggle` — semua kolom terlihat. */
const DEFAULT_VISIBLE: Record<string, boolean> = Object.fromEntries(
  PROJECT_COLUMN_TOGGLE.map((c) => [c.id, true]),
);

export function ProjectsTable({
  rows,
  ctx,
  toolbar,
  emptyMessage,
}: {
  rows: ProjectRow[];
  ctx: RbacContext;
  toolbar: React.ReactNode;
  emptyMessage: React.ReactNode;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_VISIBLE);
  const showBulk = can(ctx, "project.changeStatus");

  // Bentuk `Column[]` yang diharapkan `TableColumnToggle` — derivasi
  // dari `columnVisibility` saat ini, fallback ke `DEFAULT_VISIBLE` kalau
  // ada kolom baru ditambahkan di `projectsColumns` yang belum punya state.
  const toggleColumns = PROJECT_COLUMN_TOGGLE.map((c) => ({
    id: c.id,
    label: c.label,
    visible: columnVisibility[c.id] ?? DEFAULT_VISIBLE[c.id] ?? true,
  }));

  return (
    <div className="flex flex-col gap-3">
      {showBulk ? (
        <BulkActions selectedIds={selectedIds} onDone={() => setSelectedIds([])} />
      ) : null}

      <DataTable
        columns={projectsColumns}
        data={rows}
        searchable
        searchPlaceholder="Cari proyek atau klien…"
        rowHrefBase="/dashboard/projects"
        selectable={showBulk}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
            <TableColumnToggle
              columns={toggleColumns}
              onChange={(next) =>
                setColumnVisibility(
                  Object.fromEntries(next.map((c) => [c.id, c.visible])) as VisibilityState,
                )
              }
              storageKey="projects-table-columns"
            />
          </div>
        }
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
