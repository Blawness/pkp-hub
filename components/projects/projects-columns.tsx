"use client";

import type { Column, ColumnDef } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/projects/status-badge";
import { surveyTypeLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * Header kolom yang bisa diurutkan. Klik menggilir asc → desc; ikon menandai
 * arah aktif supaya keadaan urutan kasatmata. Sorting sendiri ditangani
 * `<DataTable>` (state + `getSortedRowModel`), header ini hanya memicunya.
 */
function SortableHeader<TData>({ column, label }: { column: Column<TData>; label: string }) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon;

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className="-mx-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
      <Icon className={cn("size-3.5", sorted ? "text-foreground" : "text-muted-foreground/60")} />
    </button>
  );
}

export type ProjectRow = {
  id: string;
  title: string;
  status: string;
  surveyType: string;
  clientName: string;
  surveyorName: string;
  orderDate: Date;
};

export const projectsColumns: ColumnDef<ProjectRow>[] = [
  {
    accessorKey: "title",
    header: "Judul",
    cell: ({ row }) => (
      <Link href={`/dashboard/projects/${row.original.id}`} className="font-medium hover:underline">
        {row.original.title}
      </Link>
    ),
  },
  {
    accessorKey: "clientName",
    header: "Klien",
  },
  {
    accessorKey: "surveyType",
    header: "Jenis",
    cell: ({ row }) => surveyTypeLabel[row.original.surveyType] ?? row.original.surveyType,
  },
  {
    accessorKey: "surveyorName",
    header: "Surveyor",
  },
  {
    accessorKey: "status",
    header: ({ column }) => <SortableHeader column={column} label="Status" />,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "orderDate",
    header: ({ column }) => <SortableHeader column={column} label="Tanggal order" />,
    sortingFn: "datetime",
    cell: ({ row }) => row.original.orderDate.toLocaleDateString("id-ID"),
  },
];
