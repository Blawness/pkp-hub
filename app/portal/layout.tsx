import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { SessionHeartbeat } from "@/components/auth/session-heartbeat";
import { UserMenu } from "@/components/dashboard/user-menu";
import { requireClient } from "@/lib/auth-guards";

export const metadata: Metadata = {
  title: { template: "%s · PKP Hub", default: "Portal Klien · PKP Hub" },
};

/**
 * Authoritative role check for the client portal area. The proxy only does a
 * coarse cookie check; this is the real gate — it hits the DB via
 * `getSession`/`requireClient`.
 *
 * `UserMenu` di topbar ini bukan hiasan: sebelumnya portal sama sekali tidak
 * punya tombol keluar MAUPUN pemilih tema di mana pun. Keduanya sudah ada dan
 * berfungsi untuk staf lewat sidebar /dashboard — klien hanya tidak pernah
 * diberi jalan ke sana.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const user = await requireClient();
  return (
    <div className="flex min-h-svh flex-col">
      <SessionHeartbeat />
      <nav className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm sm:px-8">
        <Link href="/portal" className="font-medium">
          PKP Hub
        </Link>
        <div className="w-56 shrink-0">
          <UserMenu user={user} side="bottom" />
        </div>
      </nav>
      {children}
    </div>
  );
}
