import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth-guards";

/**
 * Authoritative role check for the staff area (owner + surveyor). Middleware
 * only does a coarse cookie-cache check; this is the real gate — it hits the
 * DB via `getSession`/`requireStaff`.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return <>{children}</>;
}
