"use client";

import { useState } from "react";
import { BulkActions } from "@/components/projects/bulk-actions";
import type { ProjectRow } from "@/components/projects/projects-columns";
import { projectsColumns } from "@/components/projects/projects-columns";
import { DataTable } from "@/components/ui/data-table";
import { can } from "@/lib/rbac/can";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Wrapper klien untuk tabel proyek + bulk actions.
 * Dipisah dari Server Component supaya state selection tetap hidup.
 */
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
  const showBulk = can(ctx, "project.changeStatus");

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
        toolbar={toolbar}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
