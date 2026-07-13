"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { optionsFromLabels, SelectField, type SelectOption } from "@/components/ui/select-field";
import { documentCategoryLabel } from "@/lib/labels";

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

  const categoryOptions = optionsFromLabels(documentCategoryLabel, {
    value: "",
    label: "Semua kategori",
  });
  const clientOptions: SelectOption[] = [
    { value: "", label: "Semua klien" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        aria-label="Cari nama dokumen"
        placeholder="Cari nama dokumen..."
        className="h-8 w-56"
        defaultValue={searchParams.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value)}
      />

      <SelectField
        aria-label="Filter kategori"
        options={categoryOptions}
        value={searchParams.get("category") ?? ""}
        onValueChange={(value) => setParam("category", value)}
      />

      <SelectField
        aria-label="Filter klien"
        options={clientOptions}
        value={searchParams.get("clientId") ?? ""}
        onValueChange={(value) => setParam("clientId", value)}
      />

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
