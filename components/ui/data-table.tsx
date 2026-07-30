"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
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
import { sameIds } from "@/components/ui/data-table-selection";

/** Di atas ini, tabel dipaginasi; di bawahnya, satu halaman penuh lebih enak dibaca. */
const PAGE_SIZE = 25;

export function DataTable<TData extends { id: string }, TValue>({
  columns,
  data,
  emptyMessage = "Tidak ada data.",
  searchable = false,
  searchPlaceholder = "Cari…",
  toolbar,
  rowHrefBase,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  columnVisibility,
  onColumnVisibilityChange,
  searchStorageKey,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyMessage?: React.ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  rowHrefBase?: string;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  /**
   * Visibilitas kolom (controlled). Dipasangkan dengan
   * `<TableColumnToggle>` — parent yang memegang state dan
   * localStorage; di sini cukup diteruskan ke `useReactTable`.
   * Biarkan `undefined` kalau tabel tidak butuh toggle kolom.
   */
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (next: VisibilityState) => void;
  /**
   * Kunci localStorage untuk menyimpan isian pencarian. Dipakai agar filter
   * tidak hilang saat navigasi; diambil ulang saat mount.
   */
  searchStorageKey?: string;
}) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState(
    typeof window !== "undefined" && searchStorageKey
      ? localStorage.getItem(`datatable-search:${searchStorageKey}`) ?? ""
      : "",
  );

  // Persist search query ke localStorage tiap berubah
  React.useEffect(() => {
    if (!searchStorageKey) return;
    localStorage.setItem(`datatable-search:${searchStorageKey}`, globalFilter);
  }, [globalFilter, searchStorageKey]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  // Refs untuk memutus siklus ping-pong antara dua efek di bawah.
  // `Object.keys(rowSelection)` selalu mengembalikan array BARU, jadi kalau
  // kita membandingkan lewat `useEffect` deps saja, dua efek ini akan saling
  // picu: external → internal → emit array baru → external re-render dengan
  // reference baru → internal lagi, dst. Sampai React memotong dengan
  // "Maximum update depth exceeded" dan halaman membeku.
  //
  // Penyimpanan: ref ini mencatat "nilai terakhir yang BENAR-BENAR saya
  // apply/emit" — bukan nilai terkini. Selama isinya sama, kita skip
  // pemanggilan setter walau deps referensi-nya berubah.
  const lastAppliedExternalRef = React.useRef<string[] | null>(null);
  const lastEmittedInternalRef = React.useRef<string[] | null>(null);

  // Sync external selection state → internal. Hanya apply kalau `selectedIds`
  // BENAR-BENAR berbeda dari yang terakhir kita terapkan — kalau parent
  // mengirim array reference baru dengan isi yang sama (akibat effect 2 di
  // bawah yang emit via `Object.keys`), kita diam.
  React.useEffect(() => {
    if (!selectable) return;
    if (lastAppliedExternalRef.current && sameIds(lastAppliedExternalRef.current, selectedIds)) {
      return;
    }
    lastAppliedExternalRef.current = selectedIds;
    const next: RowSelectionState = {};
    for (const id of selectedIds) next[id] = true;
    setRowSelection(next);
  }, [selectedIds, selectable]);

  // Sync internal → external. Hanya emit kalau ids internal BENAR-BENAR
  // berbeda dari yang terakhir kita kirim ke parent. `Object.keys` di sini
  // selalu array baru — perbandingan via ref adalah satu-satunya cara untuk
  // memutus loop.
  React.useEffect(() => {
    if (!selectable || !onSelectionChange) return;
    const ids = Object.keys(rowSelection);
    if (lastEmittedInternalRef.current && sameIds(lastEmittedInternalRef.current, ids)) {
      return;
    }
    lastEmittedInternalRef.current = ids;
    onSelectionChange(ids);
  }, [rowSelection, selectable, onSelectionChange]);

  const paginated = data.length > PAGE_SIZE;

  const finalColumns = React.useMemo(() => {
    if (!selectable) return columns;

    const selectCol: ColumnDef<TData, TValue> = {
      id: "__select__",
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Pilih semua"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          className="size-4 accent-primary"
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label={`Pilih ${row.original.id}`}
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          className="size-4 accent-primary"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    };
    return [selectCol, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data,
    columns: finalColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: paginated ? getPaginationRowModel() : undefined,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: selectable ? setRowSelection : undefined,
    onColumnVisibilityChange: onColumnVisibilityChange
      ? (updater) => {
          // @tanstack/react-table dapat mengirim fungsi updater ATAU nilai
          // baru. Kita normalkan ke nilai sebelum di-forward, supaya parent
          // selalu menerima objek (lebih mudah di-derive di `TableColumnToggle`).
          const next = typeof updater === "function" ? updater(columnVisibility ?? {}) : updater;
          onColumnVisibilityChange(next);
        }
      : undefined,
    state: {
      sorting,
      globalFilter,
      rowSelection: selectable ? rowSelection : undefined,
      ...(columnVisibility !== undefined ? { columnVisibility } : {}),
    },
    initialState: { pagination: { pageSize: PAGE_SIZE } },
  });

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
            <div key="search" className="relative min-w-52 flex-1 sm:max-w-xs">
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
          {toolbar ? <React.Fragment key="toolbar">{toolbar}</React.Fragment> : null}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
        <div className="overflow-x-auto">
          <Table>
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
                    colSpan={finalColumns.length}
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
