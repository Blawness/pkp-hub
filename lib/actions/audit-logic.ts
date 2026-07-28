import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import type { RbacContext } from "@/lib/rbac/types";

export type AuditLogRow = {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  detail: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
};

const PAGE_SIZE = 25;

const ENTITY_TYPES = [
  "client",
  "project",
  "user",
  "document",
  "payment",
  "phase",
  "map",
  "equipment",
  "equipmentItem",
  "role",
] as const;

export { ENTITY_TYPES };

/**
 * Query audit log terbaru dengan pagination + filter entity type.
 * Superuser-only — `audit.read` tidak diberikan ke admin.
 */
export async function listAuditLogs(
  ctx: RbacContext,
  opts?: { page?: number; entityType?: string },
): Promise<{ rows: AuditLogRow[]; total: number }> {
  assertCan(ctx, "audit.read");

  const page = Math.max(1, opts?.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];
  if (opts?.entityType && ENTITY_TYPES.includes(opts.entityType as (typeof ENTITY_TYPES)[number])) {
    conditions.push(eq(auditLog.entityType, opts.entityType));
  }

  const [rows, [cnt]] = await Promise.all([
    db
      .select({
        id: auditLog.id,
        actorName: users.name,
        action: auditLog.action,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        detail: auditLog.detail,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .where(conditions.length > 0 ? sql`${conditions[0]}` : undefined)
      .orderBy(desc(auditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(conditions.length > 0 ? sql`${conditions[0]}` : undefined),
  ]);

  return {
    rows: rows.map((r) => ({ ...r, detail: r.detail as Record<string, unknown> | null })),
    total: cnt?.count ?? 0,
  };
}
