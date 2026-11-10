"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { formatTanggalIndo } from "@/lib/format";
import {
  BRAND_LABEL,
  COMMENT_CLASS_LABEL,
  COMMENT_STATUS_LABEL,
  MODE_LABEL,
  type SocialCommentRow,
  type SocialCommentStatus,
} from "@/lib/sosmed/types";

const statusVariant: Record<
  SocialCommentStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  drafted: "outline",
  approved: "secondary",
  posted: "default",
  skipped: "outline",
  failed: "destructive",
};

export const socialCommentsColumns: ColumnDef<SocialCommentRow>[] = [
  {
    id: "target",
    header: "Akun",
    cell: ({ row }) => (
      <span className="font-medium">
        {(row.original.mode === "sapa"
          ? row.original.targetOwner
          : (row.original.sourceAuthor ?? row.original.targetOwner)) ?? "—"}
      </span>
    ),
  },
  {
    id: "mode",
    header: "Mode",
    cell: ({ row }) => <Badge variant="outline">{MODE_LABEL[row.original.mode]}</Badge>,
  },
  {
    id: "class",
    header: "Kelas",
    cell: ({ row }) => COMMENT_CLASS_LABEL[row.original.class],
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>
        {COMMENT_STATUS_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: "draft",
    header: "Balasan",
    cell: ({ row }) => (
      <span className="block max-w-[28rem] truncate" title={row.original.draft}>
        {row.original.draft}
      </span>
    ),
  },
  {
    accessorKey: "brand",
    header: "Brand",
    cell: ({ row }) => <Badge variant="outline">{BRAND_LABEL[row.original.brand]}</Badge>,
  },
  {
    accessorKey: "postedAt",
    header: "Terkirim",
    cell: ({ row }) =>
      row.original.postedAt
        ? formatTanggalIndo(row.original.postedAt.toISOString().slice(0, 10))
        : "—",
  },
];
