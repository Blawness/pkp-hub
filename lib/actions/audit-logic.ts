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

const PAGE_SIZE = 50;

/**
 * Query audit log terbaru dengan pagination. Superuser-only —
 * `audit.read` tidak diberikan ke admin. Actor name diambil
 * lewat join ke tabel `user`.
 */
export async function listAuditLogs(
  ctx: RbacContext,
  opts?: { page?: number; entityType?: string },
): Promise<{ rows: AuditLogRow[]; total: number }> {
  assertCan(ctx, "audit.read");

  const offset = Math.max(0, (opts?.page ?? 0) - 1) * PAGE_SIZE;

  const rows = await db
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
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  // Hitung total untuk pagination. Tanpa filter entityType dulu;
  // bisa ditambah nanti.
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLog);

  return {
    rows: rows.map((r) => ({ ...r, detail: r.detail as Record<string, unknown> | null })),
    total: count,
  };
}
