"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Di atas ini, tabel dipaginasi; di bawahnya, satu halaman penuh lebih enak dibaca. */
const PAGE_SIZE = 25;

/**
 * Minimal, reusable TanStack Table wrapper over the shadcn `Table`
 * primitives (there is no upstream "data-table" block for the base-nova
 * style, so this follows the standard shadcn docs pattern by hand).
 *
 * Semua tambahan di bawah bersifat opt-in lewat prop, jadi tabel yang sudah
 * ada tidak berubah perilakunya sampai pemanggilnya meminta.
 */
export function DataTable<TData extends { id: string }, TValue>({
  columns,
  data,
  emptyMessage = "Tidak ada data.",
  searchable = false,
  searchPlaceholder = "Cari…",
  toolbar,
  rowHrefBase,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: React.ReactNode;
  /** Menampilkan kotak pencarian. Menyaring SEMUA kolom, bukan satu kolom tertentu. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Kontrol tambahan (mis. filter) yang duduk sebaris dengan kotak pencarian. */
  toolbar?: React.ReactNode;
  /**
   * Membuat baris bisa dibuka; tujuannya `${rowHrefBase}/${row.id}`.
   *
   * Sengaja string, bukan callback `(row) => string`: halaman pemanggilnya
   * adalah Server Component, dan fungsi tidak bisa diserialisasi melewati
   * batas server→client. Karena itu pula `TData` diwajibkan punya `id` —
   * supaya syarat itu ditagih saat kompilasi, bukan meledak saat dipakai.
   */
  rowHrefBase?: string;
}) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState("");

  const paginated = data.length > PAGE_SIZE;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: { sorting, globalFilter },
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

  /**
   * Baris yang bisa dibuka.
   *
   * `onClick` saja hanya melayani tetikus: <tr> bukan elemen interaktif, tidak
   * bisa difokus, dan tidak diumumkan sebagai apa pun oleh pembaca layar. Jadi
   * baris diberi `role="link"`, dapat fokus keyboard, dan menanggapi Enter —
   * sama seperti tautan sungguhan.
   */
  function rowProps(row: Row<TData>) {
    if (!rowHrefBase) return {};
    const href = `${rowHrefBase}/${row.original.id}`;

    return {
      role: "link",
      tabIndex: 0,
      onClick: () => router.push(href),
      onKeyDown: (event: React.KeyboardEvent<HTMLTableRowElement>) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        router.push(href);
      },
      className: cn(
        "cursor-pointer transition-colors hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
      ),
    };
  }

  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-3">
      {searchable || toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          {searchable ? (
            <div className="relative min-w-52 flex-1 sm:max-w-xs">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={globalFilter}
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="pl-8"
              />
            </div>
          ) : null}
          {toolbar}
        </div>
      ) : null}

      {/* `overflow-x-auto` menjaga tabel lebar tetap menggulir di dalam
          kartunya sendiri, bukan mendorong lebar seluruh halaman. */}
      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <div className="overflow-x-auto">
          <Table>
            {/* Tidak sticky: header yang sticky akan menempel pada pembungkus
                `overflow-x-auto` di atas — bukan pada viewport — sehingga ia
                melayang menimpa baris pertama alih-alih diam di puncak. Scroll
                horizontal untuk tabel lebar lebih berharga daripada header
                yang mengambang. */}
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.length ? (
                rows.map((row) => (
                  <TableRow key={row.id} {...rowProps(row)}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="p-0 text-center text-muted-foreground"
                  >
                    {globalFilter ? "Tidak ada hasil untuk pencarian ini." : emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {paginated ? (
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Halaman {table.getState().pagination.pageIndex + 1} dari {table.getPageCount()} ·{" "}
            {table.getFilteredRowModel().rows.length} baris
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
