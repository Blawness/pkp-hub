import { inArray } from "drizzle-orm";
import { FileSearchIcon } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { DocumentsFilters } from "@/components/documents/documents-filters";
import { DocumentsTable } from "@/components/documents/documents-table";
import { ReceiptsArchive } from "@/components/payments/receipts-archive";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listClients } from "@/lib/actions/clients-logic";
import { searchDocumentsForUser } from "@/lib/actions/documents-logic";
import { documentCategorySchema } from "@/lib/actions/documents-schemas";
import { listReceiptsForAdmin } from "@/lib/actions/payments-logic";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { can, scopeOf } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { downloadUrlFor } from "@/lib/storage";

export const metadata = { title: "Arsip Dokumen" };

/**
 * Cross-project document search (PRD §3 Feature 4). All filtering happens
 * server-side via `searchDocumentsForUser`, which is scoped through
 * `rbacFilter(ctx, "document.read")` — a surveyor only ever sees documents belonging to
 * projects assigned to them, never the whole table.
 *
 * Tab "Kwitansi" HANYA untuk admin: daftar semua kwitansi lintas proyek. Ini
 * sengaja dipisah dari tabel `documents` (dan dari surveyor) karena kwitansi
 * memuat nilai proyek — lihat `listReceiptsForAdmin`.
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
  const ctx = await getRbacContext();
  // Arsip kwitansi lintas-proyek butuh `payment.read` ber-scope `all` —
  // cermin gerbang `listReceiptsForAdmin`. Kolom bagikan/hapus digating
  // `document.share` (admin-only di matrix, sepaket dengan delete).
  const canViewReceiptArchive = scopeOf(ctx, "payment.read") === "all";
  const canManageDocuments = can(ctx, "document.share");

  const parsedCategory = documentCategorySchema.safeParse(filters.category);
  const results = await searchDocumentsForUser(ctx, {
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

  // `listReceiptsForAdmin` mengembalikan `receiptFileUrl` mentah; presigned
  // URL dibuat di sini (sama seperti baris dokumen) agar layer logika tetap
  // bebas dari driver storage. Lihat catatan di `downloadUrlFor`.
  const receiptSource = canViewReceiptArchive ? await listReceiptsForAdmin(ctx) : [];
  const receiptRows = await Promise.all(
    receiptSource.map(async (r) => ({
      ...r,
      downloadUrl: r.receiptFileUrl ? await downloadUrlFor(r.receiptFileUrl) : null,
    })),
  );

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <PageHeader
        title="Arsip Dokumen"
        description={
          scopeOf(ctx, "document.read") === "assigned"
            ? "Dokumen dari proyek yang ditugaskan kepada Anda."
            : "Semua dokumen lintas proyek."
        }
      />

      <Tabs defaultValue="dokumen">
        <TabsList>
          <TabsTrigger value="dokumen">Dokumen</TabsTrigger>
          {canViewReceiptArchive ? <TabsTrigger value="kwitansi">Kwitansi</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="dokumen" className="flex flex-col gap-4 pt-4">
          <DocumentsFilters clients={clientRows} />

          <DocumentsTable
            rows={rows}
            isAdmin={canManageDocuments}
            showProject
            emptyMessage={
              <EmptyState
                icon={FileSearchIcon}
                title="Tidak ada dokumen yang cocok"
                description="Coba kata kunci, kategori, atau rentang tanggal lain."
              />
            }
          />
        </TabsContent>

        {canViewReceiptArchive ? (
          <TabsContent value="kwitansi" className="pt-4">
            <ReceiptsArchive rows={receiptRows} />
          </TabsContent>
        ) : null}
      </Tabs>
    </main>
  );
}
