import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialComments, socialPosts, socialSyncRuns } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import type { RbacContext } from "@/lib/rbac/types";
import type {
  SocialCommentRow,
  SocialCommentStatus,
  SocialPostRow,
  SocialPostStatus,
  SocialSummary,
} from "./types";

/**
 * Query baca halaman Sosmed.
 *
 * Datanya ditulis MESIN (sync), bukan user, jadi tidak ada scoping per baris:
 * satu-satunya pembatas adalah permission `social.read` (admin/superuser).
 * `assertCan` dipanggil di setiap fungsi, bukan hanya di halaman — halaman
 * baru yang lupa memanggilnya tetap tidak bisa membaca data.
 */

const LIST_LIMIT = 200;

/** Daftar post pipeline, terbaru dulu; post yang belum tayang naik ke atas lewat `createdAt`. */
export async function listSocialPosts(ctx: RbacContext): Promise<SocialPostRow[]> {
  assertCan(ctx, "social.read");
  return db
    .select({
      id: socialPosts.id,
      brand: socialPosts.brand,
      externalId: socialPosts.externalId,
      title: socialPosts.title,
      pillar: socialPosts.pillar,
      status: socialPosts.status,
      version: socialPosts.version,
      scheduledAt: socialPosts.scheduledAt,
      postedAt: socialPosts.postedAt,
      permalink: socialPosts.permalink,
      slideCount: socialPosts.slideCount,
    })
    .from(socialPosts)
    .orderBy(sql`${socialPosts.postedAt} DESC NULLS LAST`, desc(socialPosts.createdAt))
    .limit(LIST_LIMIT);
}

/**
 * Daftar komentar reachout, terbaru dulu. Komentar yang belum terkirim punya
 * `postedAt` null, jadi ia mengurut di belakang — bukan hilang.
 */
export async function listSocialComments(ctx: RbacContext): Promise<SocialCommentRow[]> {
  assertCan(ctx, "social.read");
  return db
    .select({
      id: socialComments.id,
      brand: socialComments.brand,
      externalId: socialComments.externalId,
      mode: socialComments.mode,
      class: socialComments.class,
      status: socialComments.status,
      targetOwner: socialComments.targetOwner,
      permalink: socialComments.permalink,
      sourceAuthor: socialComments.sourceAuthor,
      sourceText: socialComments.sourceText,
      draft: socialComments.draft,
      reason: socialComments.reason,
      postedAt: socialComments.postedAt,
      commentCreatedAt: socialComments.commentCreatedAt,
    })
    .from(socialComments)
    .orderBy(sql`${socialComments.postedAt} DESC NULLS LAST`, desc(socialComments.createdAt))
    .limit(LIST_LIMIT);
}

/** Hitungan ringkas untuk kartu atas. Dihitung di SQL, bukan dengan memuat semua baris. */
export async function getSocialSummary(ctx: RbacContext): Promise<SocialSummary> {
  assertCan(ctx, "social.read");

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const postStatusRows = await db
    .select({ status: socialPosts.status, total: count() })
    .from(socialPosts)
    .groupBy(socialPosts.status);

  const commentStatusRows = await db
    .select({ status: socialComments.status, total: count() })
    .from(socialComments)
    .groupBy(socialComments.status);

  const [posted7d] = await db
    .select({ total: count() })
    .from(socialComments)
    .where(and(eq(socialComments.status, "posted"), gte(socialComments.postedAt, sevenDaysAgo)));

  const [lastSyncRow] = await db
    .select({
      brand: socialSyncRuns.brand,
      handle: socialSyncRuns.handle,
      status: socialSyncRuns.status,
      postsUpserted: socialSyncRuns.postsUpserted,
      commentsUpserted: socialSyncRuns.commentsUpserted,
      finishedAt: socialSyncRuns.finishedAt,
    })
    .from(socialSyncRuns)
    .orderBy(desc(socialSyncRuns.startedAt))
    .limit(1);

  const postsByStatus: Partial<Record<SocialPostStatus, number>> = {};
  for (const row of postStatusRows) {
    postsByStatus[row.status] = Number(row.total);
  }

  const commentsByStatus: Partial<Record<SocialCommentStatus, number>> = {};
  for (const row of commentStatusRows) {
    commentsByStatus[row.status] = Number(row.total);
  }

  const waiting = (commentsByStatus.drafted ?? 0) + (commentsByStatus.approved ?? 0);

  return {
    postsByStatus,
    commentsByStatus,
    commentsPosted7d: Number(posted7d?.total ?? 0),
    commentsAwaiting: waiting,
    lastSync: lastSyncRow ?? null,
  };
}
