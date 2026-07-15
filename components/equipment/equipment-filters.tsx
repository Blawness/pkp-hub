"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { optionsFromLabels, SelectField } from "@/components/ui/select-field";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

/**
 * URL-search-param-driven filters untuk daftar alat. Sama pola dengan
 * `ProjectFilters`/`DocumentsFilters`: komponen ini hanya mengubah URL,
 * penyaringannya sendiri terjadi server-side di `app/dashboard/equipment/page.tsx`.
 */
export function EquipmentFilters() {
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

  const categoryOptions = optionsFromLabels(equipmentCategoryLabel, {
    value: "",
    label: "Semua kategori",
  });
  const conditionOptions = optionsFromLabels(equipmentConditionLabel, {
    value: "",
    label: "Semua kondisi",
  });
  const statusOptions = [
    { value: "", label: "Semua status" },
    { value: "tersedia", label: "Tersedia" },
    { value: "dipakai", label: "Dipakai" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      <SelectField
        aria-label="Filter kategori"
        options={categoryOptions}
        value={searchParams.get("category") ?? ""}
        onValueChange={(value) => setParam("category", value)}
      />
      <SelectField
        aria-label="Filter kondisi"
        options={conditionOptions}
        value={searchParams.get("condition") ?? ""}
        onValueChange={(value) => setParam("condition", value)}
      />
      <SelectField
        aria-label="Filter status pakai"
        options={statusOptions}
        value={searchParams.get("status") ?? ""}
        onValueChange={(value) => setParam("status", value)}
      />
    </div>
  );
}
