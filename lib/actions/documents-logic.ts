import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { clients, documents, projects } from "@/lib/db/schema";
import { assertCan } from "@/lib/rbac/can";
import { rbacFilter } from "@/lib/rbac/filter";
import type { ScopedPermission } from "@/lib/rbac/resources";
import { requireScopedRow } from "@/lib/rbac/scoped-row";
import type { RbacContext } from "@/lib/rbac/types";
import { storage } from "@/lib/storage";
import type {
  DeleteDocumentInput,
  SearchDocumentsInput,
  ToggleDocumentShareInput,
  UploadDocumentInput,
} from "./documents-schemas";

/**
 * Server-only business logic for document upload/share/delete/search,
 * separated from the "use server" wrappers in `documents.ts` so it's
 * directly unit-testable (see `documents.test.ts`). Setiap fungsi menegakkan
 * izin sendiri lewat engine RBAC — `assertCan` untuk gerbang aksi,
 * `requireScopedRow`/`rbacFilter` untuk scope baris.
 *
 * CRITICAL: fungsi yang membaca/menulis dokumen proyek tertentu WAJIB lewat
 * `requireScopedRow`, dan daftar lintas-proyek WAJIB lewat
 * `rbacFilter(ctx, "document.read")` — bukan `db.select()` mentah. Scope `own`
 * dokumen sudah memuat aturan `sharedWithClient = true` (lihat
 * `lib/rbac/resources/document.ts`), jadi klien hanya melihat dokumen
 * proyeknya yang sudah dibagikan.
 */

/**
 * `notFound()`'s digest for this Next.js version — sama seperti
 * `projects-logic.ts#isNotFoundDigest`: terjemahkan sinyal 404
 * `requireScopedRow` jadi penolakan biasa alih-alih membiarkannya lolos dari
 * server action atau fungsi yang diuji langsung.
 */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

/** Verifikasi `ctx` boleh mengakses proyek ini; 404 → penolakan biasa. */
async function requireProjectReadOrReject(ctx: RbacContext, projectId: string) {
  try {
    return await requireScopedRow(ctx, "project.read", projectId);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }
}

/** Ambil satu dokumen yang boleh dilihat `ctx` untuk `permission`; 404 → penolakan. */
async function requireScopedDocOrReject(
  ctx: RbacContext,
  permission: ScopedPermission,
  id: string,
) {
  try {
    return (await requireScopedRow(ctx, permission, id)) as typeof documents.$inferSelect;
  } catch (error) {
    if (isNotFoundDigest(error)) throw new Error("Document not found.");
    throw error;
  }
}

/** Admin + surveyor, dan hanya untuk proyek yang boleh mereka akses. */
export async function uploadDocumentForUser(ctx: RbacContext, input: UploadDocumentInput) {
  assertCan(ctx, "document.upload");
  await requireProjectReadOrReject(ctx, input.projectId);

  const [doc] = await db
    .insert(documents)
    .values({
      projectId: input.projectId,
      name: input.name,
      category: input.category,
      fileUrl: input.fileUrl,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      uploadedById: ctx.user.id,
    })
    .returning();
  return doc;
}

/** Admin only. */
export async function toggleDocumentShareForUser(
  ctx: RbacContext,
  input: ToggleDocumentShareInput,
) {
  assertCan(ctx, "document.share");
  await requireScopedDocOrReject(ctx, "document.share", input.id);

  const [doc] = await db
    .update(documents)
    .set({ sharedWithClient: input.sharedWithClient })
    .where(eq(documents.id, input.id))
    .returning();
  return doc;
}

/** Admin only; removes the object from storage too. */
export async function deleteDocumentForUser(ctx: RbacContext, input: DeleteDocumentInput) {
  assertCan(ctx, "document.delete");
  const existing = await requireScopedDocOrReject(ctx, "document.delete", input.id);

  await db.delete(documents).where(eq(documents.id, input.id));
  try {
    await storage.delete(storage.keyFromUrl(existing.fileUrl));
  } catch {
    // Best-effort: metadata row is already gone; a dangling object in
    // storage is a cleanup concern, not a reason to fail the request.
  }
  return existing;
}

/** Scoped list of documents for a single project (used by the Dokumen tab). */
export async function listDocumentsForProject(ctx: RbacContext, projectId: string) {
  await requireProjectReadOrReject(ctx, projectId);
  return db
    .select()
    .from(documents)
    .where(and(rbacFilter(ctx, "document.read"), eq(documents.projectId, projectId)))
    .orderBy(desc(documents.createdAt));
}

/**
 * Scoped list of documents for a single project, filtered to
 * `sharedWithClient = true` ONLY — used by the client portal (PRD §3
 * Feature 6). Internal (unshared) documents must never reach the portal;
 * this is the one function that's allowed to serve documents to a client,
 * and it enforces that filter unconditionally regardless of caller role.
 */
export async function listSharedDocumentsForProject(ctx: RbacContext, projectId: string) {
  await requireProjectReadOrReject(ctx, projectId);
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.sharedWithClient, true)))
    .orderBy(desc(documents.createdAt));
}

export type DocumentSearchRow = {
  id: string;
  name: string;
  category: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  sharedWithClient: boolean;
  uploadedById: string;
  createdAt: Date;
  projectId: string;
  projectTitle: string;
  clientId: string;
  clientName: string;
};

/**
 * Cross-project document search (PRD §3 Feature 4). `rbacFilter(ctx,
 * "document.read")` adalah batas scoping-nya: satu predikat yang sudah memuat
 * SEMUA aturan — admin melihat semua, surveyor hanya dokumen proyek yang
 * ditugaskan padanya, klien hanya dokumen proyeknya yang `sharedWithClient`
 * (scope `own` resource dokumen). Tanpa izin → `sql\`false\`` → himpunan
 * kosong, bukan query mentah tak ter-scope.
 */
export async function searchDocumentsForUser(
  ctx: RbacContext,
  input: SearchDocumentsInput,
): Promise<DocumentSearchRow[]> {
  const conditions = [rbacFilter(ctx, "document.read")];
  if (input.q) conditions.push(ilike(documents.name, `%${input.q}%`));
  if (input.category) conditions.push(eq(documents.category, input.category));
  if (input.clientId) conditions.push(eq(projects.clientId, input.clientId));
  if (input.dateFrom) conditions.push(gte(documents.createdAt, new Date(input.dateFrom)));
  if (input.dateTo) conditions.push(lte(documents.createdAt, new Date(input.dateTo)));

  return db
    .select({
      id: documents.id,
      name: documents.name,
      category: documents.category,
      fileUrl: documents.fileUrl,
      fileSize: documents.fileSize,
      mimeType: documents.mimeType,
      sharedWithClient: documents.sharedWithClient,
      uploadedById: documents.uploadedById,
      createdAt: documents.createdAt,
      projectId: documents.projectId,
      projectTitle: projects.title,
      clientId: projects.clientId,
      clientName: clients.name,
    })
    .from(documents)
    .innerJoin(projects, eq(documents.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt));
}
