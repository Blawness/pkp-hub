import { asc, eq } from "drizzle-orm";
import type {
  CreateCommentInput,
  ListCommentsInput,
  MarkCommentsReadInput,
} from "@/lib/actions/comments-schemas";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { comments, users } from "@/lib/db/schema";
import { notifyProjectOfNewComment } from "@/lib/notifications/project-comment";
import { assertCan } from "@/lib/rbac/can";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";

/**
 * Logika bisnis komentar proyek (F-2025-07-005).
 *
 * Tiga operasi:
 *  1. `listCommentsForProject` — baca thread, scoped via `requireScopedRow`
 *  2. `createCommentForUser` — tulis pesan baru + audit + notifikasi email
 *  3. `markProjectCommentsReadForUser` — tandai sudah dibaca (per sisi)
 *
 * Read-tracking v1: satu boolean per sisi (`readByClient` / `readByStaff`).
 * Ketika klien membuka thread, semua comment di-set `readByClient = true`.
 * Ketika staff membuka, `readByStaff = true`. Ini cukup untuk studio kecil;
 * kalau nanti butuh unread badge per individu, tambahkan tabel join tanpa
 * mengubah tabel `comment`.
 */

export type CommentRow = typeof comments.$inferSelect;

export type CommentWithAuthor = CommentRow & {
  authorName: string;
  authorRole: string;
};

/**
 * Daftar komentar satu proyek, terurut kronologis.
 * `requireScopedRow` memastikan caller boleh melihat proyek ini —
 * surveyor hanya proyek assigned, klien hanya proyek sendiri.
 */
export async function listCommentsForProject(
  ctx: RbacContext,
  input: ListCommentsInput,
): Promise<CommentWithAuthor[]> {
  assertCan(ctx, "comment.read");
  await requireScopedRow(ctx, "project.read", input.projectId);

  const rows = await db
    .select({
      id: comments.id,
      projectId: comments.projectId,
      authorId: comments.authorId,
      body: comments.body,
      readByClient: comments.readByClient,
      readByStaff: comments.readByStaff,
      createdAt: comments.createdAt,
      authorName: users.name,
      authorRole: users.role,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(eq(comments.projectId, input.projectId))
    .orderBy(asc(comments.createdAt));

  return rows;
}

/**
 * Buat komentar baru. Setelah insert:
 *  - audit log (pola sama dengan semua aksi lain)
 *  - notifikasi email ke sisi lain (klien → staff, staff → klien)
 *
 * Notifikasi GAGAL tidak membatalkan comment — sama dengan
 * `notifyClientOfStatusChange` di `projects-logic.ts`.
 */
export async function createCommentForUser(
  ctx: RbacContext,
  input: CreateCommentInput,
): Promise<CommentRow> {
  assertCan(ctx, "comment.create");
  await requireScopedRow(ctx, "project.read", input.projectId);

  const [row] = await db
    .insert(comments)
    .values({
      projectId: input.projectId,
      authorId: ctx.user.id,
      body: input.body,
      // Pesan baru dari staf otomatis "sudah dibaca staf" (dia yang menulis).
      // Pesan baru dari klien otomatis "sudah dibaca klien".
      readByStaff: ctx.user.role !== "client",
      readByClient: ctx.user.role === "client",
    })
    .returning();

  await recordAudit({
    actorId: ctx.user.id,
    action: "create",
    entityType: "comment",
    entityId: row.id,
    detail: { projectId: input.projectId, bodyLength: input.body.length },
  });

  // Notifikasi email — fire-and-forget, kegagalan tidak membatalkan comment.
  try {
    await notifyProjectOfNewComment(ctx, row);
  } catch (error) {
    console.error(
      `[notifikasi] gagal mengabari soal komentar baru di proyek ${input.projectId}:`,
      error,
    );
  }

  return row;
}

/**
 * Tandai semua komentar di proyek ini sebagai "sudah dibaca" untuk sisi caller.
 * Klien → set `readByClient = true` di semua baris.
 * Staff → set `readByStaff = true` di semua baris.
 *
 * Idempoten: memanggil berulang tidak mengubah apa pun setelah yang pertama.
 */
export async function markProjectCommentsReadForUser(
  ctx: RbacContext,
  input: MarkCommentsReadInput,
): Promise<void> {
  assertCan(ctx, "comment.read");
  await requireScopedRow(ctx, "project.read", input.projectId);

  const isClient = ctx.user.role === "client";
  await db
    .update(comments)
    .set(isClient ? { readByClient: true } : { readByStaff: true })
    .where(eq(comments.projectId, input.projectId));
}
