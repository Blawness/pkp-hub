"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = { value: string; label: string };

/**
 * Satu-satunya cara memasang dropdown di app ini.
 *
 * Sebelumnya semua filter dan form memakai `<select>` NATIVE. Kotaknya memang
 * ikut gelap — itu Tailwind — tapi daftar opsinya digambar oleh browser/OS,
 * bukan CSS kita, jadi popup-nya tetap muncul dengan palet terang di dark mode.
 * `color-scheme: dark` (lihat `app/globals.css`) memperbaikinya untuk sebagian
 * kontrol native, tapi TIDAK untuk popup <select> di Chromium — itulah bug yang
 * terlihat di produksi. Satu-satunya jalan keluar yang benar adalah berhenti
 * memakai popup milik browser dan memakai popup yang kita render sendiri.
 *
 * `items` bukan duplikat dari `options`: Base UI memakainya untuk memetakan
 * value tersimpan -> label saat merender <SelectValue>. Tanpa itu, trigger
 * menampilkan value mentahnya ("data_diambil"), bukan "Data Diambil".
 */
export function SelectField({
  options,
  value,
  onValueChange,
  onBlur,
  id,
  name,
  className,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  name?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
}) {
  const items: Record<string, string> = {};
  for (const option of options) {
    items[option.value] = option.label;
  }

  return (
    <Select
      items={items}
      value={value}
      // Base UI mengirim `null` kalau pilihan dibatalkan. Seluruh pemanggil di
      // app ini memakai "" sebagai "tidak dipilih" (dan sebagai nilai opsi
      // "Semua ..."), jadi normalkan di sini alih-alih di setiap call site.
      onValueChange={(next) => onValueChange((next as string | null) ?? "")}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        onBlur={onBlur}
        className={className}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** `{ baru: "Baru" }` -> `[{ value: "baru", label: "Baru" }]`, opsional dengan opsi "semua" di depan. */
export function optionsFromLabels(
  labels: Record<string, string>,
  leading?: SelectOption,
): SelectOption[] {
  const options = Object.entries(labels).map(([value, label]) => ({ value, label }));
  return leading ? [leading, ...options] : options;
}
