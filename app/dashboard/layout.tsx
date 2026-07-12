import Link from "next/link";
import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth-guards";

/**
 * Authoritative role check for the staff area (owner + surveyor). Middleware
 * only does a coarse cookie-cache check; this is the real gate — it hits the
 * DB via `getSession`/`requireStaff`.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();

  return (
    <div className="flex min-h-svh flex-col">
      <nav className="flex items-center gap-4 border-b border-border px-8 py-3 text-sm">
        <Link href="/dashboard" className="font-medium">
          PKP Hub
        </Link>
        <Link href="/dashboard/projects" className="text-muted-foreground hover:text-foreground">
          Proyek
        </Link>
        {user.role === "owner" ? (
          <Link href="/dashboard/clients" className="text-muted-foreground hover:text-foreground">
            Klien
          </Link>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
