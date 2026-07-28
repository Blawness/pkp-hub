"use client";

import { PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { GridTexture } from "@/components/brand/grid-texture";
import { buildLinks, SIDEBAR_PIN_COOKIE } from "@/components/dashboard/nav-config";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { usePermissions } from "@/components/rbac/permissions-provider";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth-guards";
import { cn } from "@/lib/utils";

/**
 * Sidebar staf (desktop). Laci mobile hidup di `mobile-nav.tsx`.
 *
 * Preferensi pin disimpan di cookie, bukan localStorage, supaya layout di
 * server sudah tahu lebarnya pada render pertama. Dengan localStorage sidebar
 * akan selalu tergambar lebar dulu lalu menciut setelah hidrasi — kedip yang
 * terlihat setiap kali memuat halaman.
 *
 * BENTUK: `<aside>` bukan yang terlihat — ia cuma PENAHAN RUANG, dan lebarnya
 * hanya bergantung pada `pinned`. Yang terlihat adalah panel `absolute` di
 * dalamnya. Pemisahan ini yang memungkinkan panel melebar MENIMPA konten alih-
 * alih mendorongnya: `<aside>` adalah flex item, jadi mengubah lebarnya selalu
 * menggeser kolom di sebelahnya.
 */
export function DashboardSidebar({
  user,
  defaultPinned,
}: {
  user: SessionUser;
  defaultPinned: boolean;
}) {
  const [pinned, setPinned] = useState(defaultPinned);
  const { can } = usePermissions();
  const links = buildLinks(can);

  const collapsed = !pinned;

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    // max-age 1 tahun; preferensi tata letak, bukan data sensitif.
    // biome-ignore lint/suspicious/noDocumentCookie: CookieStore API belum ada di Safari, dan tidak sepadan untuk satu penulisan cookie sesederhana ini.
    document.cookie = `${SIDEBAR_PIN_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-slot="sidebar"
      className={cn(
        "relative hidden shrink-0 md:block",
        // Sticky setinggi viewport, bukan setinggi dokumen: tanpa ini aside
        // ikut memanjang mengikuti isi halaman, dan blok pengguna di kakinya
        // terdorong jauh ke bawah lipatan — tak terlihat sampai halaman
        // digulir habis.
        "sticky top-0 h-svh",
        "transition-[width] duration-(--motion-base) ease-(--ease-out-expo)",
        pinned ? "w-64" : "w-[4.5rem]",
      )}
    >
      <div
        data-slot="sidebar-panel"
        data-collapsed={collapsed}
        className={cn(
          "absolute inset-y-0 left-0 z-30 flex flex-col overflow-hidden",
          "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "transition-[width] duration-(--motion-base) ease-(--ease-out-expo)",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        {/* Tekstur grid yang sama dengan panel brand — memudar ke bawah supaya
            tidak bersaing dengan tautan navigasi. */}
        <GridTexture className="pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />

        {/*
          Tombol pin duduk di header, bukan di kaki sidebar. Pojok kiri-bawah
          adalah wilayah yang direbut hal lain — overlay devtools, pratinjau URL
          yang dimunculkan browser saat menunjuk tautan — jadi tombol di sana
          gampang tertimpa dan tak bisa ditekan.
        */}
        <div
          className={cn(
            "relative flex h-16 items-center gap-2 px-3",
            collapsed && "justify-center px-0",
          )}
        >
          {collapsed ? null : (
            <>
              <Image
                src="/logo-pkp.webp"
                alt=""
                aria-hidden
                width={32}
                height={32}
                priority
                className="ml-1 size-7 shrink-0"
              />
              <span className="font-heading flex-1 truncate text-sm font-semibold tracking-tight">
                PKP Hub
              </span>
            </>
          )}

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={togglePin}
                  aria-label={pinned ? "Lepas pin sidebar" : "Pin sidebar tetap terbuka"}
                  // `aria-pressed`, bukan `aria-expanded`: ini tombol dwi-keadaan
                  // yang MENGUNCI, bukan pengungkap. Sejak hover jadi pemicu
                  // buka-tutup, "expanded" bukan lagi milik tombol ini.
                  aria-pressed={pinned}
                  className="text-muted-foreground"
                >
                  <PanelLeftIcon className={cn("transition-transform", !pinned && "rotate-180")} />
                </Button>
              }
            />
            <TooltipContent side="right">
              {pinned ? "Lepas pin sidebar" : "Pin sidebar tetap terbuka"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="relative flex-1 overflow-y-auto py-2">
          <SidebarNav links={links} collapsed={collapsed} />
        </div>

        <div className="relative border-t border-sidebar-border p-2">
          <UserMenu user={user} collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
