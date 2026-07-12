import Link from "next/link";
import type { ReactNode } from "react";
import { requireClient } from "@/lib/auth-guards";

/**
 * Authoritative role check for the client portal area. Middleware only does
 * a coarse cookie-cache check; this is the real gate — it hits the DB via
 * `getSession`/`requireClient`.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requireClient();
  return (
    <div className="flex min-h-svh flex-col">
      <nav className="flex items-center gap-4 border-b border-border px-8 py-3 text-sm">
        <Link href="/portal" className="font-medium">
          PKP Hub
        </Link>
      </nav>
      {children}
    </div>
  );
}
