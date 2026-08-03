import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
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

/**
 * Audit timeline untuk satu entitas spesifik (proyek, klien, dsb.).
 * Memakai composite index `audit_log_entity_idx(entityType, entityId)`
 * — index-only scan yang sangat murah. Hasil dibatasi ke `limit` terbaru.
 *
 * Permission: `project.read` untuk proyek, `client.read` untuk klien,
 * `audit.read` untuk entitas lain. Ini memungkinkan staf melihat riwayat
 * proyek/klien tanpa harus superuser.
 */
export async function listAuditForEntity(
  ctx: RbacContext,
  params: { entityType: string; entityId: string; limit?: number },
): Promise<AuditLogRow[]> {
  // Gate sesuai entitas — superuser dipersempit tidak perlu di sini.
  if (params.entityType === "project") {
    assertCan(ctx, "project.read");
    // Row-level scoping (SAST-002): `assertCan` is role-level only — a
    // surveyor (scope `assigned`) must not read another project's timeline
    // by passing an arbitrary entityId. `requireScopedRow` uses the SAME
    // rbacFilter as the list path; out-of-scope ids yield an empty timeline
    // instead of leaking rows.
    try {
      await requireScopedRow(ctx, "project.read", params.entityId);
    } catch {
      return [];
    }
  } else if (params.entityType === "client") assertCan(ctx, "client.read");
  else assertCan(ctx, "audit.read");

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
    .where(and(eq(auditLog.entityType, params.entityType), eq(auditLog.entityId, params.entityId)))
    .orderBy(desc(auditLog.createdAt))
    .limit(params.limit ?? 30);

  return rows.map((r) => ({ ...r, detail: r.detail as Record<string, unknown> | null }));
}
