import type { SessionUser } from "@/lib/auth-guards";
import { listProjectsForUser } from "@/lib/auth-guards";

/**
 * Server-only business logic for the client portal's project list (PRD §3
 * Feature 6). The detail page (`app/portal/projects/[id]/page.tsx`) does
 * NOT go through a wrapper here — it calls `assertProjectAccess` directly
 * (same pattern as `app/dashboard/projects/[id]/page.tsx`) so a real
 * `notFound()` propagates for a project a client doesn't own, rather than
 * a translated 500. `listSharedDocumentsForProject` /
 * `listMapLayersForProject` re-verify access themselves (defense in depth),
 * same as the staff project page.
 */

function requireClientRole(user: SessionUser) {
  if (user.role !== "client") {
    throw new Error("Only a client can view the portal.");
  }
}

export type PortalProjectSummary = {
  id: string;
  title: string;
  status: string;
  surveyType: string;
  locationLabel: string | null;
  orderDate: Date;
};

/**
 * The logged-in client's own projects, newest first. Sourced entirely via
 * `listProjectsForUser` — the row-level scoping boundary — which for a
 * `client` role already returns only rows whose `clientId` matches the
 * `clients` row linked to this user (never another client's projects).
 */
export async function listPortalProjects(user: SessionUser): Promise<PortalProjectSummary[]> {
  requireClientRole(user);
  const rows = await listProjectsForUser(user);
  return rows
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      surveyType: p.surveyType,
      locationLabel: p.locationLabel,
      orderDate: p.orderDate,
    }))
    .sort((a, b) => b.orderDate.getTime() - a.orderDate.getTime());
}
