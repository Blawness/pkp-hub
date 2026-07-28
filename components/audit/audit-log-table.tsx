"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLogRow } from "@/lib/actions/audit-logic";
import { cn } from "@/lib/utils";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function DetailCell({ detail }: { detail: Record<string, unknown> | null }) {
  if (!detail) return <span className="text-muted-foreground">—</span>;

  const entries = Object.entries(detail).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="max-w-64 truncate text-xs font-mono text-muted-foreground">
      {entries.map(([k, v]) => `${k}=${String(v)}`).join(", ")}
    </span>
  );
}

const actionBadge: Record<string, string> = {
  create: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
  update: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  delete: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  archive: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  restore: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  login: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  assign: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  void: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
};

function ActionBadge({ action }: { action: string }) {
  const colors = actionBadge[action] ?? "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex rounded px-1.5 py-0.5 text-xs font-medium", colors)}>
      {action}
    </span>
  );
}

type Props = {
  rows: AuditLogRow[];
  currentPage: number;
  totalPages: number;
  entityType?: string;
  entityTypes: string[];
};

export function AuditLogTable({ rows, currentPage, totalPages, entityType, entityTypes }: Props) {
  const router = useRouter();

  function buildHref(page: number, type?: string) {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (type) params.set("entityType", type);
    const qs = params.toString();
    return `/dashboard/settings/audit${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <SelectField
          aria-label="Filter entitas"
          className="w-48"
          options={[
            { value: "", label: "Semua entitas" },
            ...entityTypes.map((t) => ({ value: t, label: t })),
          ]}
          value={entityType ?? ""}
          onValueChange={(v) => {
            const href = buildHref(1, v || undefined);
            router.push(href);
          }}
        />
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground text-sm">Belum ada catatan audit.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40">Waktu</TableHead>
                  <TableHead>Aktor</TableHead>
                  <TableHead className="w-24">Aksi</TableHead>
                  <TableHead>Entitas</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="w-36">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {row.actorName ?? (
                        <span className="text-muted-foreground italic">Terhapus</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={row.action} />
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.entityType}
                      </span>
                      <span className="mx-1 text-muted-foreground">/</span>
                      <span className="font-mono text-xs">{row.entityId.slice(0, 8)}…</span>
                    </TableCell>
                    <TableCell>
                      <DetailCell detail={row.detail} />
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">
                      {row.ipAddress ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground text-sm">
                Halaman {currentPage} dari {totalPages}
              </p>
              <div className="flex gap-2">
                {currentPage > 1 && (
                  <Link href={buildHref(currentPage - 1, entityType)}>
                    <Button variant="outline" size="sm">
                      <ChevronLeftIcon className="size-4" />
                      Sebelumnya
                    </Button>
                  </Link>
                )}
                {currentPage < totalPages && (
                  <Link href={buildHref(currentPage + 1, entityType)}>
                    <Button variant="outline" size="sm">
                      Berikutnya
                      <ChevronRightIcon className="size-4" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
