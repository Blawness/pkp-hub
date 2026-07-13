import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth-guards";

/**
 * Client management (PRD §3 Feature 1) is admin-only. Surveyors must not be
 * able to view, create, or edit clients — this is the authoritative gate;
 * `proxy.ts` is only a coarse cookie-presence check.
 */
export default async function ClientsLayout({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
