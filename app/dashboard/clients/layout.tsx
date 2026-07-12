import type { ReactNode } from "react";
import { requireOwner } from "@/lib/auth-guards";

/**
 * Client management (PRD §3 Feature 1) is owner-only. Surveyors must not be
 * able to view, create, or edit clients — this is the authoritative gate;
 * `middleware.ts` is only a coarse cookie-presence check.
 */
export default async function ClientsLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return <>{children}</>;
}
