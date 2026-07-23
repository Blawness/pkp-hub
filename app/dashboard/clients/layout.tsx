import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { can } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";

/**
 * Client management (PRD §3 Feature 1) digerbangi `client.read` (admin-only
 * di matrix). Surveyors must not be able to view, create, or edit clients —
 * this is the authoritative gate; `proxy.ts` is only a coarse cookie-presence
 * check. Tanpa izin → dipantulkan ke /dashboard, bukan disuguhi error.
 */
export default async function ClientsLayout({ children }: { children: ReactNode }) {
  const ctx = await getRbacContext();
  if (!can(ctx, "client.read")) redirect("/dashboard");
  return <>{children}</>;
}
