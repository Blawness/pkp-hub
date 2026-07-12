"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { documentCategoryLabel } from "@/lib/labels";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * URL-search-param-driven filters for the cross-project document search
 * (PRD §3 Feature 4). Same pattern as `ProjectFilters`: this component only
 * edits the URL, filtering itself happens server-side in
 * `app/dashboard/documents/page.tsx`.
 */
export function DocumentsFilters({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        aria-label="Cari nama dokumen"
        placeholder="Cari nama dokumen..."
        className="h-8 w-56"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value)}
      />

      <select
        aria-label="Filter kategori"
        className={selectClassName}
        value={searchParams.get("category") ?? ""}
        onChange={(e) => setParam("category", e.target.value)}
      >
        <option value="">Semua kategori</option>
        {Object.entries(documentCategoryLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter klien"
        className={selectClassName}
        value={searchParams.get("clientId") ?? ""}
        onChange={(e) => setParam("clientId", e.target.value)}
      >
        <option value="">Semua klien</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <Input
        aria-label="Dari tanggal"
        type="date"
        className="h-8 w-36"
        defaultValue={searchParams.get("dateFrom") ?? ""}
        onChange={(e) => setParam("dateFrom", e.target.value)}
      />
      <Input
        aria-label="Sampai tanggal"
        type="date"
        className="h-8 w-36"
        defaultValue={searchParams.get("dateTo") ?? ""}
        onChange={(e) => setParam("dateTo", e.target.value)}
      />
    </div>
  );
}
