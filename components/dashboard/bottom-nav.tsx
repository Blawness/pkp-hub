"use client";

import {
  FileTextIcon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/components/rbac/permissions-provider";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { segment: "/dashboard", label: "Beranda", icon: LayoutDashboardIcon },
  {
    segment: "/dashboard/projects",
    label: "Proyek",
    icon: FolderKanbanIcon,
    permission: "project.read" as const,
  },
  {
    segment: "/dashboard/documents",
    label: "Dokumen",
    icon: FileTextIcon,
    permission: "document.read" as const,
  },
  {
    segment: "/dashboard/equipment",
    label: "Alat",
    icon: WrenchIcon,
    permission: "equipment.read" as const,
  },
  {
    segment: "/dashboard/clients",
    label: "Klien",
    icon: UsersIcon,
    permission: "client.read" as const,
  },
];

/**
 * Navigasi bawah (bottom nav) untuk viewport mobile. Sidebar tetap
 * digunakan di desktop (md+); komponen ini hanya muncul di bawah md.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { can } = usePermissions();

  const visible = NAV_ITEMS.filter((item) => !item.permission || can(item.permission));

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around",
        "border-t border-border bg-background px-1 pb-3 pt-1.5",
        "md:hidden",
      )}
    >
      {visible.map((item) => {
        const active = pathname.startsWith(item.segment);
        return (
          <Link
            key={item.segment}
            href={item.segment}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium",
              "transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <item.icon className="size-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
