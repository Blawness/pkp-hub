import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

export async function recordAudit(params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  detail?: Record<string, unknown>;
}) {
  let ipAddress: string | null = null;
  try {
    const h = await headers();
    ipAddress = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    // Called outside request scope (e.g. tests) — skip IP.
  }

  await db.insert(auditLog).values({
    actorId: params.actorId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    detail: params.detail ?? null,
    ipAddress,
  });
}
