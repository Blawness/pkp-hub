"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Role } from "@/lib/auth-guards";

type NavLink = { href: string; label: string };

function buildLinks(role: Role): NavLink[] {
  const links: NavLink[] = [
    { href: "/dashboard/projects", label: "Proyek" },
    { href: "/dashboard/documents", label: "Dokumen" },
  ];
  if (role === "owner") {
    links.push({ href: "/dashboard/clients", label: "Klien" });
  }
  return links;
}

/**
 * Staff dashboard nav (Phase 8 polish): same links as before, but the shell
 * now collapses into a `Sheet` drawer under `sm` instead of overflowing the
 * viewport at 375px. Desktop layout/links are unchanged.
 */
export function DashboardNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const links = buildLinks(role);

  return (
    <nav className="flex items-center justify-between border-b border-border px-4 py-3 text-sm sm:justify-start sm:gap-4 sm:px-8">
      <Link href="/dashboard" className="font-medium">
        PKP Hub
      </Link>

      <div className="hidden items-center gap-4 sm:flex">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="text-muted-foreground hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="sm:hidden"
              aria-label="Buka menu navigasi"
            >
              <MenuIcon />
            </Button>
          }
        />
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-2 text-sm text-foreground hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
