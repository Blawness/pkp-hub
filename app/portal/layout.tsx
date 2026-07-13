import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { requireClient } from "@/lib/auth-guards";

export const metadata: Metadata = {
  title: { template: "%s · PKP Hub", default: "Portal Klien · PKP Hub" },
};

/**
 * Authoritative role check for the client portal area. The proxy only does
 * a coarse cookie-cache check; this is the real gate — it hits the DB via
 * `getSession`/`requireClient`.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requireClient();
  return (
    <div className="flex min-h-svh flex-col">
      <nav className="flex items-center gap-4 border-b border-border px-4 py-3 text-sm sm:px-8">
        <Link href="/portal" className="font-medium">
          PKP Hub
        </Link>
      </nav>
      {children}
    </div>
  );
}
