import type { ReactNode } from "react";
import { requireClient } from "@/lib/auth-guards";

/**
 * Authoritative role check for the client portal area. Middleware only does
 * a coarse cookie-cache check; this is the real gate — it hits the DB via
 * `getSession`/`requireClient`.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requireClient();
  return <>{children}</>;
}
