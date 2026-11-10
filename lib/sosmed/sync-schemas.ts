import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Kontrak payload `POST /api/sosmed/sync` — diisi pipeline lokal
 * (`_shared/sosmed-pipeline/komentar`, perintah `hub-sync`), bukan form user.
 *
 * Dua hal yang sengaja dijaga di sini:
 *  1. Enum ditulis ulang sebagai literal di file ini, bukan diimpor dari
 *     `schema.ts`, supaya payload yang tidak sah (mis. status dari versi engine
 *     yang lebih baru) ditolak dengan pesan jelas sebelum menyentuh database.
 *  2. Semua kolom yang boleh kosong memakai `.nullable().optional()`: pipeline
 *     mengirim `null` untuk field yang belum ada, dan `undefined` harus tetap
 *     sah agar batch lama tidak pecah saat engine menambah field.
 */

export const SYNC_BRANDS = ["pkp", "trihuni"] as const;
export const POST_STATUSES = [
  "idea",
  "drafted",
  "in_review",
  "revision",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "skipped",
] as const;
export const COMMENT_MODES = ["balas", "sapa"] as const;
export const COMMENT_CLASSES = [
  "pertanyaan",
  "lead",
  "pujian",
  "kritik",
  "spam",
  "internal",
  "lain",
] as const;
export const COMMENT_STATUSES = ["drafted", "approved", "posted", "skipped", "failed"] as const;

const isoInstant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .nullable()
  .optional();

export const syncPostSchema = z.object({
  /** Slug folder `posts/<YYYY-MM-DD>-<slug>` — kunci idempoten. */
  externalId: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  pillar: z.string().trim().max(40).nullable().optional(),
  status: z.enum(POST_STATUSES),
  version: z.number().int().min(1).max(99).optional(),
  scheduledAt: isoInstant,
  postedAt: isoInstant,
  permalink: z.url().max(300).nullable().optional(),
  caption: z.string().max(5000).nullable().optional(),
  slideCount: z.number().int().min(0).max(20).nullable().optional(),
});

export const syncCommentSchema = z.object({
  /** Id item engine komentar, mis. `k-261110-d3ed` — kunci idempoten. */
  externalId: z.string().trim().min(1).max(80),
  mode: z.enum(COMMENT_MODES),
  class: z.enum(COMMENT_CLASSES),
  status: z.enum(COMMENT_STATUSES),
  targetOwner: z.string().trim().max(80).nullable().optional(),
  postId: z.string().trim().max(80).nullable().optional(),
  permalink: z.url().max(300).nullable().optional(),
  sourceAuthor: z.string().trim().max(80).nullable().optional(),
  sourceText: z.string().max(2200).nullable().optional(),
  draft: z.string().trim().min(1).max(2200),
  reason: z.string().max(500).nullable().optional(),
  commentCreatedAt: isoInstant,
  approvedAt: isoInstant,
  postedAt: isoInstant,
});

export const syncPayloadSchema = z.object({
  brand: z.enum(SYNC_BRANDS),
  handle: z.string().trim().min(2).max(80),
  /** Identitas pengirim, mis. `komentar-cli` + versi. Hanya untuk jejak sync. */
  source: z.string().trim().max(120).optional(),
  posts: z.array(syncPostSchema).max(200).default([]),
  comments: z.array(syncCommentSchema).max(500).default([]),
});

export type SyncPostInput = z.infer<typeof syncPostSchema>;
export type SyncCommentInput = z.infer<typeof syncCommentSchema>;
export type SyncPayload = z.infer<typeof syncPayloadSchema>;

/**
 * Bandingkan token Bearer dengan token server TANPA membocorkan panjang/awalan
 * lewat waktu pembandingan. `crypto.timingSafeEqual` melempar bila panjang
 * buffer berbeda, jadi panjang dicek lebih dulu — itu memang membocorkan
 * panjang token, dan itu tidak masalah: panjang bukan rahasia.
 */
export function tokenMatches(headerValue: string | null, expected: string): boolean {
  if (!headerValue || !expected) return false;
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const provided = Buffer.from(match[1], "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (provided.length !== wanted.length) return false;
  return timingSafeEqual(provided, wanted);
}
