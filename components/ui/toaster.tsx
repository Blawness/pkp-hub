"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

/**
 * Toaster global (sonner) — dipasang sekali di root layout, mengikuti tema
 * next-themes. `richColors` memberi hijau/merah untuk sukses/error sehingga
 * status terbaca sekilas; `closeButton` agar toast panjang bisa ditutup.
 */
export function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={
        resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "system"
      }
      position="top-right"
      richColors
      closeButton
    />
  );
}
