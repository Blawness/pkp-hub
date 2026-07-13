import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";
import { requireStaff } from "@/lib/auth-guards";

export const metadata: Metadata = {
  title: { template: "%s · PKP Hub", default: "Dashboard · PKP Hub" },
};

/**
 * Authoritative role check for the staff area (owner + surveyor). The proxy
 * only does a coarse cookie-cache check; this is the real gate — it hits the
 * DB via `getSession`/`requireStaff`.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardNav role={user.role} />
      {children}
    </div>
  );
}
