import { desc, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import type { RbacContext } from "@/lib/rbac/types";

export type SessionRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  createdAt: Date;
};

/**
 * List semua sesi aktif (belum expired). Superuser-only — `session.read`
 * tidak diberikan ke admin.
 */
export async function listActiveSessions(ctx: RbacContext): Promise<SessionRow[]> {
  assertCan(ctx, "session.read");

  const now = new Date();
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      userName: users.name,
      userEmail: users.email,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      expiresAt: sessions.expiresAt,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(gt(sessions.expiresAt, now))
    .orderBy(desc(sessions.createdAt));

  return rows;
}

/**
 * Cabut sesi tertentu. Superuser-only — `session.revoke` tidak diberikan
 * ke admin. Anti-self-revoke: tidak bisa mencabut sesi sendiri.
 */
export async function revokeSession(ctx: RbacContext, sessionId: string): Promise<void> {
  assertCan(ctx, "session.revoke");

  const [session] = await db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session) throw new Error("Sesi tidak ditemukan.");
  if (session.userId === ctx.user.id) {
    throw new Error("Anda tidak bisa mencabut sesi Anda sendiri lewat halaman ini.");
  }

  await db.delete(sessions).where(eq(sessions.id, sessionId));
}
