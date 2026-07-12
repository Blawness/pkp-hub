"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * URL-search-param-driven filters (status / klien / surveyor / jenis) for
 * the project list. Filtering itself happens server-side in
 * `app/dashboard/projects/page.tsx` reading these same params — this
 * component only edits the URL, it never filters client-side.
 */
export function ProjectFilters({
  clients,
  surveyors,
}: {
  clients: { id: string; name: string }[];
  surveyors: { id: string; name: string }[];
}) {
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
      <select
        aria-label="Filter status"
        className={selectClassName}
        value={searchParams.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
      >
        <option value="">Semua status</option>
        {Object.entries(statusLabel).map(([value, label]) => (
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

      <select
        aria-label="Filter surveyor"
        className={selectClassName}
        value={searchParams.get("surveyorId") ?? ""}
        onChange={(e) => setParam("surveyorId", e.target.value)}
      >
        <option value="">Semua surveyor</option>
        {surveyors.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Filter jenis"
        className={selectClassName}
        value={searchParams.get("surveyType") ?? ""}
        onChange={(e) => setParam("surveyType", e.target.value)}
      >
        <option value="">Semua jenis</option>
        {Object.entries(surveyTypeLabel).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
