"use client";

import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGlobalSearch } from "./global-search-palette";

/**
 * Tombol pemicu Cmd-K di topbar. Membaca `setOpen` dari context palette —
 * dipisah dari dialog itu sendiri karena pemicu dan dialog hidup di
 * subtree yang berbeda (topbar vs layout root) dan UI di antara keduanya
 * (breadcrumb) tidak relevan dengan state palette.
 *
 * Sembunyikan diri bila user tidak punya `search.use`. Action server
 * sendiri sudah membayar gerbang itu, tapi menyembunyikan tombolnya
 * mencegah dialog terbuka untuk sia-sia — dan konsisten dengan
 * penggunaan `usePermissions` di komponen RBAC-gated lainnya.
 */
export function GlobalSearchTrigger({ className }: { className?: string }) {
  const { setOpen } = useGlobalSearch();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      className={className}
      aria-label="Buka pencarian global"
    >
      <SearchIcon data-icon="inline-start" aria-hidden />
      Cari…
      <kbd className="ml-2 text-xs font-medium tracking-wide text-muted-foreground opacity-80">
        ⌘K
      </kbd>
    </Button>
  );
}
