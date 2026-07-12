"use client";

import { buildDocumentsColumns, type DocumentRow } from "@/components/documents/documents-columns";
import { DataTable } from "@/components/ui/data-table";

/**
 * Thin client wrapper so `buildDocumentsColumns` (whose cell renderers embed
 * client components like `DocumentShareToggle`) is built INSIDE client code
 * — calling it from a Server Component and passing the resulting
 * `ColumnDef[]` (which contains plain functions, not JSX) across the RSC
 * boundary isn't serializable and throws at runtime.
 */
export function DocumentsTable({
  rows,
  isOwner,
  showProject = false,
  emptyMessage = "Belum ada dokumen.",
}: {
  rows: DocumentRow[];
  isOwner: boolean;
  showProject?: boolean;
  emptyMessage?: string;
}) {
  return (
    <DataTable
      columns={buildDocumentsColumns({ isOwner, showProject })}
      data={rows}
      emptyMessage={emptyMessage}
    />
  );
}
