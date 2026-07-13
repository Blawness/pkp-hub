"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Tema gelap/terang untuk seluruh aplikasi.
 *
 * `attribute="class"` menempelkan `.dark` ke <html>, yang persis dipakai oleh
 * `@custom-variant dark (&:is(.dark *))` di `app/globals.css` — token gelap di
 * sana sudah lengkap sejak awal, yang belum ada hanya pemasang class-nya.
 *
 * next-themes menyuntikkan script blocking sebelum paint untuk membaca
 * preferensi tersimpan, jadi tidak ada kedip putih saat memuat halaman. Script
 * itulah yang membuat markup server dan client berbeda pada render pertama,
 * karena itu <html> di `app/layout.tsx` memakai `suppressHydrationWarning`.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
