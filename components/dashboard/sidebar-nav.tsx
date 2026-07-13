"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import type { NavLink } from "@/components/dashboard/nav-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Daftar tautan navigasi. Dipakai dua kali — di sidebar desktop dan di laci
 * mobile — dengan `collapsed` mati di laci, karena laci tidak pernah menciut.
 *
 * `useSelectedLayoutSegment` mengembalikan segmen satu tingkat di bawah layout
 * yang memanggilnya, jadi dari `app/dashboard/layout.tsx` nilainya adalah
 * "projects" | "documents" | "clients" | null (null = /dashboard sendiri).
 * Ini sebabnya /dashboard/projects/123 tetap menandai "Proyek" sebagai aktif:
 * segmen yang lebih dalam tidak ikut terbaca. Mencocokkan pathname dengan
 * `startsWith` akan memberi hasil serupa, tapi keliru pada /dashboard — yang
 * jadi prefiks semua route lain, sehingga selalu ikut menyala.
 */
export function SidebarNav({
  links,
  collapsed = false,
  onNavigate,
}: {
  links: NavLink[];
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const segment = useSelectedLayoutSegment();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {links.map((link) => {
        const active = link.segment === segment;
        const Icon = link.icon;

        const item = (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              collapsed && "justify-center px-0",
            )}
          >
            {/*
              Latar item aktif dibagi lewat `layoutId`, jadi saat berpindah menu
              ia BERGESER dari item lama ke item baru alih-alih hilang lalu
              muncul. Ini teknik morph yang sama dengan panel brand antar-route.
              MotionConfig reducedMotion="user" di root otomatis mematikannya
              bagi pengguna yang memintanya.
            */}
            {active ? (
              <motion.span
                layoutId="sidebar-active-item"
                aria-hidden
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="absolute inset-0 rounded-lg bg-sidebar-accent"
              />
            ) : null}

            <Icon className={cn("relative size-4 shrink-0", active && "text-primary")} />
            {collapsed ? null : <span className="relative truncate">{link.label}</span>}
          </Link>
        );

        // Saat menciut, label jadi tooltip — kalau tidak, sidebar rail hanya
        // deretan ikon tanpa nama.
        return collapsed ? (
          <Tooltip key={link.href}>
            <TooltipTrigger render={item} />
            <TooltipContent side="right">{link.label}</TooltipContent>
          </Tooltip>
        ) : (
          item
        );
      })}
    </nav>
  );
}
