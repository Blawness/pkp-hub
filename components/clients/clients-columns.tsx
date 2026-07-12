"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

export type ClientRow = {
  id: string;
  name: string;
  type: "individual" | "company";
  phone: string | null;
  email: string | null;
  archivedAt: Date | null;
};

const typeLabel: Record<ClientRow["type"], string> = {
  individual: "Perorangan",
  company: "Perusahaan",
};

export const clientsColumns: ColumnDef<ClientRow>[] = [
  {
    accessorKey: "name",
    header: "Nama",
    cell: ({ row }) => (
      <Link href={`/dashboard/clients/${row.original.id}`} className="font-medium hover:underline">
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: "type",
    header: "Tipe",
    cell: ({ row }) => typeLabel[row.original.type],
  },
  {
    accessorKey: "phone",
    header: "Telepon",
    cell: ({ row }) => row.original.phone ?? "—",
  },
  {
    accessorKey: "email",
    header: "Email",
    cell: ({ row }) => row.original.email ?? "—",
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) =>
      row.original.archivedAt ? (
        <Badge variant="outline">Diarsipkan</Badge>
      ) : (
        <Badge variant="secondary">Aktif</Badge>
      ),
  },
];
