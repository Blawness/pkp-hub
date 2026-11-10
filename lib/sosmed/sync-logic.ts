import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialComments, socialPosts, socialSyncRuns } from "@/lib/db/schema";
import type { SyncCommentInput, SyncPayload, SyncPostInput } from "./sync-schemas";

/**
 * Inti ingest `POST /api/sosmed/sync`.
 *
 * Dipisah dari route supaya bisa diuji tanpa HTTP, dan supaya route-nya tetap
 * tipis: auth → parse → panggil ini → balas.
 *
 * Idempotensi bergantung pada unique index `(brand, external_id)` di kedua
 * tabel. Kirim ulang batch yang sama memperbarui baris yang ada, tidak
 * menggandakannya — penting karena pipeline mengirim ulang seluruh queue setiap
 * kali sync, bukan hanya delta.
 *
 * Setiap panggilan dicatat di `social_sync_run`, termasuk yang gagal. Tanpa
 * catatan itu, "data tidak muncul di Hub" tidak bisa dibedakan dari "push tidak
 * pernah sampai".
 */

function postRow(brand: SyncPayload["brand"], post: SyncPostInput) {
  return {
    brand,
    externalId: post.externalId,
    title: post.title,
    pillar: post.pillar ?? null,
    status: post.status,
    version: post.version ?? 1,
    scheduledAt: post.scheduledAt ?? null,
    postedAt: post.postedAt ?? null,
    permalink: post.permalink ?? null,
    caption: post.caption ?? null,
    slideCount: post.slideCount ?? null,
  };
}

function commentRow(brand: SyncPayload["brand"], comment: SyncCommentInput) {
  return {
    brand,
    externalId: comment.externalId,
    mode: comment.mode,
    class: comment.class,
    status: comment.status,
    targetOwner: comment.targetOwner ?? null,
    postId: comment.postId ?? null,
    permalink: comment.permalink ?? null,
    sourceAuthor: comment.sourceAuthor ?? null,
    sourceText: comment.sourceText ?? null,
    draft: comment.draft,
    reason: comment.reason ?? null,
    commentCreatedAt: comment.commentCreatedAt ?? null,
    approvedAt: comment.approvedAt ?? null,
    postedAt: comment.postedAt ?? null,
  };
}

export type SyncResult = {
  runId: string;
  postsUpserted: number;
  commentsUpserted: number;
};

export async function applySyncPayload(payload: SyncPayload): Promise<SyncResult> {
  const [run] = await db
    .insert(socialSyncRuns)
    .values({
      brand: payload.brand,
      handle: payload.handle,
      source: payload.source ?? null,
    })
    .returning();

  try {
    const now = new Date();
    await db.transaction(async (tx) => {
      if (payload.posts.length > 0) {
        await tx
          .insert(socialPosts)
          .values(payload.posts.map((post) => postRow(payload.brand, post)))
          .onConflictDoUpdate({
            target: [socialPosts.brand, socialPosts.externalId],
            set: {
              title: sql`excluded.title`,
              pillar: sql`excluded.pillar`,
              status: sql`excluded.status`,
              version: sql`excluded.version`,
              scheduledAt: sql`excluded.scheduled_at`,
              postedAt: sql`excluded.posted_at`,
              permalink: sql`excluded.permalink`,
              caption: sql`excluded.caption`,
              slideCount: sql`excluded.slide_count`,
              syncedAt: now,
              updatedAt: now,
            },
          });
      }

      if (payload.comments.length > 0) {
        await tx
          .insert(socialComments)
          .values(payload.comments.map((comment) => commentRow(payload.brand, comment)))
          .onConflictDoUpdate({
            target: [socialComments.brand, socialComments.externalId],
            set: {
              mode: sql`excluded.mode`,
              class: sql`excluded.class`,
              status: sql`excluded.status`,
              targetOwner: sql`excluded.target_owner`,
              postId: sql`excluded.post_id`,
              permalink: sql`excluded.permalink`,
              sourceAuthor: sql`excluded.source_author`,
              sourceText: sql`excluded.source_text`,
              draft: sql`excluded.draft`,
              reason: sql`excluded.reason`,
              commentCreatedAt: sql`excluded.comment_created_at`,
              approvedAt: sql`excluded.approved_at`,
              postedAt: sql`excluded.posted_at`,
              syncedAt: now,
              updatedAt: now,
            },
          });
      }
    });

    await db
      .update(socialSyncRuns)
      .set({
        status: "ok",
        postsUpserted: payload.posts.length,
        commentsUpserted: payload.comments.length,
        finishedAt: new Date(),
      })
      .where(eq(socialSyncRuns.id, run.id));

    return {
      runId: run.id,
      postsUpserted: payload.posts.length,
      commentsUpserted: payload.comments.length,
    };
  } catch (error) {
    // Catat kegagalan tanpa menelan error: pemanggil (route) tetap membalas 500
    // dan pipeline melihat pesan aslinya.
    await db
      .update(socialSyncRuns)
      .set({
        status: "failed",
        finishedAt: new Date(),
        note: error instanceof Error ? error.message.slice(0, 500) : "error tak dikenal",
      })
      .where(eq(socialSyncRuns.id, run.id));
    throw error;
  }
}
