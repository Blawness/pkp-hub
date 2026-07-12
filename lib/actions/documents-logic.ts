import { and, desc, eq, gte, ilike, inArray, lte } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess, listProjectsForUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients, documents, projects } from "@/lib/db/schema";
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
 * directly unit-testable (see `documents.test.ts`). Every function here
 * re-checks the caller's role/scoping itself — defense in depth alongside
 * `ownerActionClient` / `staffActionClient` in `documents.ts`, not a
 * replacement for it.
 *
 * CRITICAL: any function that reads/writes a specific project's documents
 * MUST go through `assertProjectAccess`, and any cross-project listing MUST
 * go through `listProjectsForUser` — never a raw `db.select()` on
 * `projects`. That's the row-level scoping boundary this whole module
 * exists to protect (surveyor sees only their assigned projects' documents,
 * client sees only their own).
 */

function requireOwner(user: SessionUser) {
  if (user.role !== "owner") {
    throw new Error("Only the owner can perform this action.");
  }
}

function requireStaff(user: SessionUser) {
  if (user.role !== "owner" && user.role !== "surveyor") {
    throw new Error("You do not have permission to perform this action.");
  }
}

/**
 * `notFound()`'s digest for this Next.js version — same rationale as
 * `projects-logic.ts#isNotFoundDigest`: translate `assertProjectAccess`'s
 * 404 signal into a plain rejection instead of letting it escape a server
 * action or a directly-unit-tested function.
 */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function assertProjectAccessOrReject(projectId: string, user: SessionUser) {
  try {
    return await assertProjectAccess(projectId, user);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }
}

/** Owner + surveyor, and only for a project they can access. */
export async function uploadDocumentForUser(user: SessionUser, input: UploadDocumentInput) {
  requireStaff(user);
  await assertProjectAccessOrReject(input.projectId, user);

  const [doc] = await db
    .insert(documents)
    .values({
      projectId: input.projectId,
      name: input.name,
      category: input.category,
      fileUrl: input.fileUrl,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      uploadedById: user.id,
    })
    .returning();
  return doc;
}

/** Owner only. */
export async function toggleDocumentShareForUser(
  user: SessionUser,
  input: ToggleDocumentShareInput,
) {
  requireOwner(user);

  const [existing] = await db.select().from(documents).where(eq(documents.id, input.id));
  if (!existing) throw new Error("Document not found.");
  await assertProjectAccessOrReject(existing.projectId, user);

  const [doc] = await db
    .update(documents)
    .set({ sharedWithClient: input.sharedWithClient })
    .where(eq(documents.id, input.id))
    .returning();
  return doc;
}

/** Owner only; removes the object from storage too. */
export async function deleteDocumentForUser(user: SessionUser, input: DeleteDocumentInput) {
  requireOwner(user);

  const [existing] = await db.select().from(documents).where(eq(documents.id, input.id));
  if (!existing) throw new Error("Document not found.");
  await assertProjectAccessOrReject(existing.projectId, user);

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
export async function listDocumentsForProject(user: SessionUser, projectId: string) {
  await assertProjectAccessOrReject(projectId, user);
  return db
    .select()
    .from(documents)
    .where(eq(documents.projectId, projectId))
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
 * Cross-project document search (PRD §3 Feature 4). `listProjectsForUser` is
 * the scoping boundary here: a surveyor only ever sees documents whose
 * project is assigned to them, a client only their own projects' shared
 * documents — never a raw, unscoped `documents` query.
 */
export async function searchDocumentsForUser(
  user: SessionUser,
  input: SearchDocumentsInput,
): Promise<DocumentSearchRow[]> {
  const allowedProjects = await listProjectsForUser(user);
  const allowedProjectIds = allowedProjects.map((p) => p.id);
  if (allowedProjectIds.length === 0) return [];

  const conditions = [inArray(documents.projectId, allowedProjectIds)];
  if (input.q) conditions.push(ilike(documents.name, `%${input.q}%`));
  if (input.category) conditions.push(eq(documents.category, input.category));
  if (input.clientId) conditions.push(eq(projects.clientId, input.clientId));
  if (input.dateFrom) conditions.push(gte(documents.createdAt, new Date(input.dateFrom)));
  if (input.dateTo) conditions.push(lte(documents.createdAt, new Date(input.dateTo)));

  // Client role additionally only ever sees documents explicitly shared
  // with them — `listProjectsForUser` scopes by project ownership, this
  // adds the per-document visibility rule on top.
  if (user.role === "client") {
    conditions.push(eq(documents.sharedWithClient, true));
  }

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
