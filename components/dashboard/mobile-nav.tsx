"use client";

import { MenuIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { buildLinks } from "@/components/dashboard/nav-config";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { SessionUser } from "@/lib/auth-guards";

/**
 * Navigasi mobile: sidebar yang sama, dibungkus laci. Di bawah `md` sidebar
 * desktop disembunyikan dan tombol ini yang muncul di topbar.
 *
 * `onNavigate` menutup laci setelah tautan ditekan — tanpa itu, navigasi klien
 * mengganti isi halaman di belakang laci yang masih terbuka menutupinya.
 */
export function MobileNav({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const links = buildLinks(user.role);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="Buka menu navigasi"
          >
            <MenuIcon />
          </Button>
        }
      />
      <SheetContent side="left" className="flex flex-col p-0">
        <SheetHeader className="h-16 justify-center px-4">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <Image src="/logo-pkp.webp" alt="" aria-hidden width={28} height={28} className="size-6" />
            PKP Hub
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-2">
          <SidebarNav links={links} onNavigate={() => setOpen(false)} />
        </div>

        <div className="border-t border-border p-2">
          <UserMenu user={user} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
