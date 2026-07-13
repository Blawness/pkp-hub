"use client";

import { XIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { statusLabel, surveyTypeLabel } from "@/lib/labels";

/** Param yang ditampilkan sebagai chip, terurut sesuai urutan select di toolbar. */
const FILTER_KEYS = ["status", "clientId", "surveyorId", "surveyType"] as const;

/**
 * Chip untuk tiap filter yang sedang aktif, masing-masing bisa dilepas.
 *
 * Sebelum ini, satu-satunya cara membersihkan filter adalah menyisir keempat
 * select dan menebak mana yang masih terisi — sementara filter yang aktif tidak
 * terlihat sama sekali kecuali dengan membuka select-nya. Chip membuat keadaan
 * itu kasatmata sekaligus bisa dibatalkan.
 *
 * Sama seperti <ProjectFilters>, komponen ini hanya menyunting URL. Penyaringan
 * tetap terjadi di server (`app/dashboard/projects/page.tsx`), di atas baris
 * yang sudah di-scope per-role — melepas chip tidak pernah bisa memperlebar
 * akses, hanya mengubah param.
 */
export function ActiveFilters({
  clients,
  surveyors,
}: {
  clients: { id: string; name: string }[];
  surveyors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const surveyorName = new Map(surveyors.map((s) => [s.id, s.name]));

  function labelFor(key: (typeof FILTER_KEYS)[number], value: string): string {
    switch (key) {
      case "status":
        return statusLabel[value] ?? value;
      case "surveyType":
        return surveyTypeLabel[value] ?? value;
      case "clientId":
        return clientName.get(value) ?? "Klien";
      case "surveyorId":
        return surveyorName.get(value) ?? "Surveyor";
    }
  }

  const active = FILTER_KEYS.flatMap((key) => {
    const value = searchParams.get(key);
    return value ? [{ key, value }] : [];
  });

  if (active.length === 0) return null;

  function clear(key?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key) {
      params.delete(key);
    } else {
      for (const k of FILTER_KEYS) params.delete(k);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="flex basis-full flex-wrap items-center gap-2">
      {active.map(({ key, value }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-2.5 text-xs"
        >
          {labelFor(key, value)}
          <button
            type="button"
            onClick={() => clear(key)}
            aria-label={`Hapus filter ${labelFor(key, value)}`}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <XIcon className="size-3" />
          </button>
        </span>
      ))}

      {active.length > 1 ? (
        <button
          type="button"
          onClick={() => clear()}
          className="rounded-md px-1.5 py-1 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Hapus semua
        </button>
      ) : null}
    </div>
  );
}
