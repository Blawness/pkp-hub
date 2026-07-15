"use client";

import { PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { GridTexture } from "@/components/brand/grid-texture";
import { buildLinks, SIDEBAR_COOKIE } from "@/components/dashboard/nav-config";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth-guards";
import { cn } from "@/lib/utils";

/**
 * Sidebar staf (desktop). Laci mobile hidup di `mobile-nav.tsx`.
 *
 * Kondisi menciut disimpan di cookie, bukan localStorage, supaya layout di
 * server sudah tahu lebarnya pada render pertama. Dengan localStorage sidebar
 * akan selalu tergambar lebar dulu lalu menciut setelah hidrasi — kedip yang
 * terlihat setiap kali memuat halaman bagi siapa pun yang memilih rail.
 */
export function DashboardSidebar({
  user,
  defaultCollapsed,
}: {
  user: SessionUser;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const links = buildLinks(user.role);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    // max-age 1 tahun; preferensi tata letak, bukan data sensitif.
    // biome-ignore lint/suspicious/noDocumentCookie: CookieStore API belum ada di Safari, dan tidak sepadan untuk satu penulisan cookie sesederhana ini.
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "relative hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex",
        // Sticky setinggi viewport, bukan setinggi dokumen: tanpa ini aside
        // ikut memanjang mengikuti isi halaman, dan blok pengguna di kakinya
        // terdorong jauh ke bawah lipatan — tak terlihat sampai halaman
        // digulir habis.
        "sticky top-0 h-svh",
        "transition-[width] duration-(--motion-base) ease-(--ease-out-expo)",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      {/* Tekstur grid yang sama dengan panel brand — memudar ke bawah supaya
          tidak bersaing dengan tautan navigasi. */}
      <GridTexture className="pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_60%)]" />

      {/*
        Tombol ciut duduk di header, bukan di kaki sidebar. Pojok kiri-bawah
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
                onClick={toggle}
                aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
                aria-expanded={!collapsed}
                className="text-muted-foreground"
              >
                <PanelLeftIcon className={cn("transition-transform", collapsed && "rotate-180")} />
              </Button>
            }
          />
          <TooltipContent side="right">
            {collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="relative flex-1 overflow-y-auto py-2">
        <SidebarNav links={links} collapsed={collapsed} />
      </div>

      <div className="relative border-t border-sidebar-border p-2">
        <UserMenu user={user} collapsed={collapsed} />
      </div>
    </aside>
  );
}
