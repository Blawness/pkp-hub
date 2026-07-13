"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { optionsFromLabels, SelectField, type SelectOption } from "@/components/ui/select-field";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";

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

  // "" adalah opsi sungguhan ("Semua ..."), bukan placeholder: memilihnya
  // berarti membuang param filternya dari URL — lihat `setParam`.
  const statusOptions = optionsFromLabels(statusLabel, { value: "", label: "Semua status" });
  const typeOptions = optionsFromLabels(surveyTypeLabel, { value: "", label: "Semua jenis" });
  const clientOptions: SelectOption[] = [
    { value: "", label: "Semua klien" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];
  const surveyorOptions: SelectOption[] = [
    { value: "", label: "Semua surveyor" },
    ...surveyors.map((s) => ({ value: s.id, label: s.name })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <SelectField
        aria-label="Filter status"
        options={statusOptions}
        value={searchParams.get("status") ?? ""}
        onValueChange={(value) => setParam("status", value)}
      />
      <SelectField
        aria-label="Filter klien"
        options={clientOptions}
        value={searchParams.get("clientId") ?? ""}
        onValueChange={(value) => setParam("clientId", value)}
      />
      <SelectField
        aria-label="Filter surveyor"
        options={surveyorOptions}
        value={searchParams.get("surveyorId") ?? ""}
        onValueChange={(value) => setParam("surveyorId", value)}
      />
      <SelectField
        aria-label="Filter jenis"
        options={typeOptions}
        value={searchParams.get("surveyType") ?? ""}
        onValueChange={(value) => setParam("surveyType", value)}
      />
    </div>
  );
}
