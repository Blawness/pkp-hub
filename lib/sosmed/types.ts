/**
 * Bentuk baris yang dikirim `social-logic.ts` ke komponen tabel.
 *
 * Tinggal di modul murni (tanpa import server/db) supaya bisa dipakai bersama
 * oleh Server Component dan komponen kolom yang ber-`"use client"`.
 */

export type SocialBrand = "pkp" | "trihuni";

export type SocialPostStatus =
  | "idea"
  | "drafted"
  | "in_review"
  | "revision"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "skipped";

export type SocialCommentMode = "balas" | "sapa";

export type SocialCommentClass =
  | "pertanyaan"
  | "lead"
  | "pujian"
  | "kritik"
  | "spam"
  | "internal"
  | "lain";

export type SocialCommentStatus = "drafted" | "approved" | "posted" | "skipped" | "failed";

export type SocialPostRow = {
  id: string;
  brand: SocialBrand;
  externalId: string;
  title: string;
  pillar: string | null;
  status: SocialPostStatus;
  version: number;
  scheduledAt: Date | null;
  postedAt: Date | null;
  permalink: string | null;
  slideCount: number | null;
};

export type SocialCommentRow = {
  id: string;
  brand: SocialBrand;
  externalId: string;
  mode: SocialCommentMode;
  class: SocialCommentClass;
  status: SocialCommentStatus;
  targetOwner: string | null;
  permalink: string | null;
  sourceAuthor: string | null;
  sourceText: string | null;
  draft: string;
  reason: string | null;
  postedAt: Date | null;
  commentCreatedAt: Date | null;
};

export type SocialSyncInfo = {
  brand: SocialBrand;
  handle: string;
  status: "ok" | "partial" | "failed";
  postsUpserted: number;
  commentsUpserted: number;
  finishedAt: Date | null;
};

export type SocialSummary = {
  postsByStatus: Partial<Record<SocialPostStatus, number>>;
  commentsByStatus: Partial<Record<SocialCommentStatus, number>>;
  commentsPosted7d: number;
  commentsAwaiting: number;
  lastSync: SocialSyncInfo | null;
};

export const POST_STATUS_LABEL: Record<SocialPostStatus, string> = {
  idea: "Ide",
  drafted: "Draf",
  in_review: "Review",
  revision: "Revisi",
  approved: "Disetujui",
  scheduled: "Terjadwal",
  published: "Tayang",
  rejected: "Ditolak",
  skipped: "Dilewati",
};

export const COMMENT_STATUS_LABEL: Record<SocialCommentStatus, string> = {
  drafted: "Draf",
  approved: "Disetujui",
  posted: "Terkirim",
  skipped: "Dilewati",
  failed: "Gagal",
};

export const COMMENT_CLASS_LABEL: Record<SocialCommentClass, string> = {
  pertanyaan: "Pertanyaan",
  lead: "Lead",
  pujian: "Pujian",
  kritik: "Kritik",
  spam: "Spam",
  internal: "Internal",
  lain: "Lain",
};

export const BRAND_LABEL: Record<SocialBrand, string> = {
  pkp: "PKP",
  trihuni: "Trihuni",
};

export const MODE_LABEL: Record<SocialCommentMode, string> = {
  balas: "Balas",
  sapa: "Sapa",
};
