"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";

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
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="secondary">{statusLabel[row.original.status] ?? row.original.status}</Badge>
    ),
  },
  {
    accessorKey: "orderDate",
    header: "Tanggal order",
    cell: ({ row }) => row.original.orderDate.toLocaleDateString("id-ID"),
  },
];
