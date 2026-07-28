"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/dashboard/settings/users", label: "User" },
  { href: "/dashboard/settings/roles", label: "Peran" },
  { href: "/dashboard/settings/audit", label: "Audit" },
] as const;

/**
 * Tab internal di dalam area Pengaturan. Sengaja terpisah dari sidebar
 * (`nav-config.ts`), yang cuma punya satu entri "Pengaturan" — tab "Peran"
 * hanya untuk yang punya `role.read` (praktis: superuser), tab "Audit" hanya
 * untuk yang punya `audit.read` (superuser-only), jadi disembunyikan lewat
 * prop `showRoles` / `showAudit`, bukan lewat gating nav-config.
 */
export function SettingsTabs({ showRoles, showAudit }: { showRoles: boolean; showAudit: boolean }) {
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => {
    if (tab.label === "Peran" && !showRoles) return false;
    if (tab.label === "Audit" && !showAudit) return false;
    return true;
  });
  if (tabs.length < 2) return null;

  return (
    <nav className="flex gap-1 border-foreground/10 border-b">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 font-medium text-sm transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
