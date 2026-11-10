"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatTanggalIndo } from "@/lib/format";
import {
  BRAND_LABEL,
  POST_STATUS_LABEL,
  type SocialPostRow,
  type SocialPostStatus,
} from "@/lib/sosmed/types";

const statusVariant: Record<SocialPostStatus, "default" | "secondary" | "outline" | "destructive"> =
  {
    idea: "outline",
    drafted: "outline",
    in_review: "secondary",
    revision: "destructive",
    approved: "secondary",
    scheduled: "secondary",
    published: "default",
    rejected: "destructive",
    skipped: "outline",
  };

export const socialPostsColumns: ColumnDef<SocialPostRow>[] = [
  {
    accessorKey: "title",
    header: "Postingan",
    cell: ({ row }) => {
      const { title, permalink } = row.original;
      return permalink ? (
        <Link
          href={permalink}
          target="_blank"
          rel="noreferrer"
          className="font-medium hover:underline"
        >
          {title}
        </Link>
      ) : (
        <span className="font-medium">{title}</span>
      );
    },
  },
  {
    accessorKey: "brand",
    header: "Brand",
    cell: ({ row }) => <Badge variant="outline">{BRAND_LABEL[row.original.brand]}</Badge>,
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant={statusVariant[row.original.status]}>
        {POST_STATUS_LABEL[row.original.status]}
      </Badge>
    ),
  },
  {
    accessorKey: "pillar",
    header: "Pilar",
    cell: ({ row }) => row.original.pillar ?? "—",
  },
  {
    accessorKey: "slideCount",
    header: "Slide",
    cell: ({ row }) => row.original.slideCount ?? "—",
  },
  {
    accessorKey: "postedAt",
    header: "Tayang",
    cell: ({ row }) =>
      row.original.postedAt
        ? formatTanggalIndo(row.original.postedAt.toISOString().slice(0, 10))
        : "—",
  },
];
