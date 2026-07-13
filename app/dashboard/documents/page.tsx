import { inArray } from "drizzle-orm";
import { FileSearchIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DocumentsFilters } from "@/components/documents/documents-filters";
import { DocumentsTable } from "@/components/documents/documents-table";
import { EmptyState } from "@/components/ui/empty-state";
import { listClients } from "@/lib/actions/clients-logic";
import { searchDocumentsForUser } from "@/lib/actions/documents-logic";
import { documentCategorySchema } from "@/lib/actions/documents-schemas";
import { requireStaff } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { downloadUrlFor } from "@/lib/storage";

export const metadata = { title: "Arsip Dokumen" };

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

  // `searchDocumentsForUser` sudah menyaring baris sesuai peran; penandatanganan
  // di sini hanya mengubah baris yang BOLEH dilihat menjadi tautan yang bisa
  // dibuka. Lihat catatan di `downloadUrlFor`.
  const rows = await Promise.all(
    results.map(async (r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      downloadUrl: await downloadUrlFor(r.fileUrl),
      fileSize: r.fileSize,
      mimeType: r.mimeType,
      sharedWithClient: r.sharedWithClient,
      uploaderName: uploaderNameById.get(r.uploadedById) ?? "—",
      createdAt: r.createdAt,
      projectId: r.projectId,
      projectTitle: r.projectTitle,
      clientName: r.clientName,
    })),
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Arsip Dokumen"
        description={
          user.role === "surveyor"
            ? "Dokumen dari proyek yang ditugaskan kepada Anda."
            : "Semua dokumen lintas proyek."
        }
      />

      <DocumentsFilters clients={clientRows} />

      <DocumentsTable
        rows={rows}
        isAdmin={user.role === "admin"}
        showProject
        emptyMessage={
          <EmptyState
            icon={FileSearchIcon}
            title="Tidak ada dokumen yang cocok"
            description="Coba kata kunci, kategori, atau rentang tanggal lain."
          />
        }
      />
    </main>
  );
}
