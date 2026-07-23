import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SessionHeartbeat } from "@/components/auth/session-heartbeat";
import { SIDEBAR_COOKIE } from "@/components/dashboard/nav-config";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { Topbar } from "@/components/dashboard/topbar";
import { PermissionsProvider } from "@/components/rbac/permissions-provider";
import { requireStaff } from "@/lib/auth-guards";
import { getRbacContext } from "@/lib/rbac/context";
import type { Permission } from "@/lib/rbac/resources";

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
  const ctx = await getRbacContext();
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "1";

  return (
    // Hanya DAFTAR permission yang menyeberang ke klien (untuk gating
    // kosmetik: sidebar, tombol) — bukan scope, bukan data. Cast aman:
    // `loadEffectivePermissions` sudah menyaring grant lewat `isPermission`.
    <PermissionsProvider permissions={[...ctx.permissions.keys()] as Permission[]}>
      <div className="flex min-h-svh">
        <SessionHeartbeat />
        <DashboardSidebar user={user} defaultCollapsed={collapsed} />

        {/* `min-w-0` menahan kolom ini agar tidak melar mengikuti isinya — tanpa
            itu, tabel lebar akan mendorong seluruh layout dan sidebar ikut
            tergeser keluar layar. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          {children}
        </div>
      </div>
    </PermissionsProvider>
  );
}
