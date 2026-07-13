import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SIDEBAR_COOKIE } from "@/components/dashboard/nav-config";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { requireStaff } from "@/lib/auth-guards";

export const metadata: Metadata = {
  title: { template: "%s · PKP Hub", default: "Dashboard · PKP Hub" },
};

/**
 * Authoritative role check for the staff area (admin + surveyor). The proxy
 * only does a coarse cookie-cache check; this is the real gate — it hits the
 * DB via `getSession`/`requireStaff`.
 *
 * Kondisi ciut sidebar dibaca di sini, di server, supaya rail sudah tergambar
 * dengan lebar yang benar pada cat pertama (lihat `sidebar.tsx`).
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <div className="flex min-h-svh">
      <DashboardSidebar user={user} defaultCollapsed={collapsed} />

      {/* `min-w-0` menahan kolom ini agar tidak melar mengikuti isinya — tanpa
          itu, tabel lebar akan mendorong seluruh layout dan sidebar ikut
          tergeser keluar layar. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} />
        {children}
      </div>
    </div>
  );
}
