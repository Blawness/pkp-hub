import { inArray } from "drizzle-orm";
import { DocumentsFilters } from "@/components/documents/documents-filters";
import { DocumentsTable } from "@/components/documents/documents-table";
import { listClients } from "@/lib/actions/clients-logic";
import { searchDocumentsForUser } from "@/lib/actions/documents-logic";
import { documentCategorySchema } from "@/lib/actions/documents-schemas";
import { requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * Cross-project document search (PRD §3 Feature 4). All filtering happens
 * server-side via `searchDocumentsForUser`, which is scoped through
 * `listProjectsForUser` — a surveyor only ever sees documents belonging to
 * projects assigned to them, never the whole table.
 */
export default async function DocumentsSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    clientId?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
}) {
  const filters = await searchParams;
  const user = await requireStaff();

  const parsedCategory = documentCategorySchema.safeParse(filters.category);
  const results = await searchDocumentsForUser(user, {
    q: filters.q,
    category: parsedCategory.success ? parsedCategory.data : undefined,
    clientId: filters.clientId,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  });

  const uploaderIds = [...new Set(results.map((r) => r.uploadedById))];
  const uploaderUsers = uploaderIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(inArray(users.id, uploaderIds))
    : [];
  const uploaderNameById = new Map(uploaderUsers.map((u) => [u.id, u.name]));

  const clientRows = await listClients();

  const rows = results.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    fileUrl: r.fileUrl,
    fileSize: r.fileSize,
    mimeType: r.mimeType,
    sharedWithClient: r.sharedWithClient,
    uploaderName: uploaderNameById.get(r.uploadedById) ?? "—",
    createdAt: r.createdAt,
    projectId: r.projectId,
    projectTitle: r.projectTitle,
    clientName: r.clientName,
  }));

  return (
    <main className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-medium">Arsip Dokumen</h1>
        <p className="text-sm text-muted-foreground">
          {user.role === "surveyor"
            ? "Dokumen dari proyek yang ditugaskan kepada Anda."
            : "Semua dokumen lintas proyek."}
        </p>
      </div>

      <DocumentsFilters clients={clientRows} />

      <DocumentsTable
        rows={rows}
        isOwner={user.role === "owner"}
        showProject
        emptyMessage="Tidak ada dokumen yang cocok."
      />
    </main>
  );
}
