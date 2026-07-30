"use client";

import { usePermissions } from "@/components/rbac/permissions-provider";
import { GlobalSearchTrigger } from "@/components/search/global-search-trigger";

/**
 * Pemicu ⌘K untuk topbar portal klien.
 *
 * Sama dengan `<GlobalSearchTrigger />` di dashboard topbar, tapi DENGAN
 * gerbang `usePermissions` lokal — `GlobalSearchTrigger` me-render tombol
 * tanpa peduli izin, lalu andalkan palette internal yang tak akan membuka
 * apa pun kalau user tak punya `search.use`. Untuk portal ini kita ingin
 * tombolnya HILANG sama sekali bila izin tak ada, supaya klien tanpa izin
 * tak melihat UI yang menggantung saat diklik.
 *
 * Server-component (layout portal) tak bisa memanggil `usePermissions`,
 * jadi pemicu dibungkus di komponen klien kecil ini — dipisah dari
 * `GlobalSearchTrigger` (yang dipakai mentah oleh dashboard topbar) supaya
 * satu tempat fokus ke kontrol izin, dan yang lain fokus ke tombol.
 */
export function PortalSearchButton() {
  const { can } = usePermissions();
  if (!can("search.use")) return null;
  return <GlobalSearchTrigger />;
}
