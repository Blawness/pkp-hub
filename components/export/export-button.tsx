"use client";

import { useSearchParams } from "next/navigation";

/**
 * Tombol ekspor generik untuk semua laporan. HANYA tahu string id laporan —
 * tidak meng-import `lib/export/*` (termasuk exceljs/pdf-lib) supaya dua
 * dependency server itu tidak ikut ke bundle browser.
 *
 * Klien tidak mengirim baris data: ia hanya meneruskan `searchParams` yang
 * sedang aktif (filter kategori/status) lewat query string, server yang
 * mengambil ulang datanya.
 */
export function ExportButton({ report, label = "Ekspor" }: { report: string; label?: string }) {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());

  const pdfHref = `/api/export/${report}?format=pdf&${params.toString()}`;
  const xlsxHref = `/api/export/${report}?format=xlsx&${params.toString()}`;

  return (
    <span className="flex gap-2">
      <a
        href={pdfHref}
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        {label} PDF
      </a>
      <a
        href={xlsxHref}
        className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
      >
        {label} Excel
      </a>
    </span>
  );
}
