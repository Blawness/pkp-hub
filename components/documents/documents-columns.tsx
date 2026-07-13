import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { DeleteDocumentButton } from "@/components/documents/delete-document-button";
import { DocumentPreviewDialog } from "@/components/documents/document-preview-dialog";
import { DocumentShareToggle } from "@/components/documents/document-share-toggle";
import { formatFileSize } from "@/lib/format";
import { documentCategoryLabel } from "@/lib/labels";

export type DocumentRow = {
  id: string;
  name: string;
  category: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  sharedWithClient: boolean;
  uploaderName: string;
  createdAt: Date;
  /** Present only on the cross-project search page. */
  projectId?: string;
  projectTitle?: string;
  clientName?: string;
};

/** `isAdmin` gates the share-toggle + delete columns (admin-only actions). */
export function buildDocumentsColumns({
  isAdmin,
  showProject = false,
}: {
  isAdmin: boolean;
  showProject?: boolean;
}): ColumnDef<DocumentRow>[] {
  const columns: ColumnDef<DocumentRow>[] = [
    {
      accessorKey: "name",
      header: "Nama",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
  ];

  if (showProject) {
    columns.push({
      accessorKey: "projectTitle",
      header: "Proyek",
      cell: ({ row }) =>
        row.original.projectId ? (
          <Link href={`/dashboard/projects/${row.original.projectId}`} className="hover:underline">
            {row.original.projectTitle}
          </Link>
        ) : (
          "—"
        ),
    });
    columns.push({ accessorKey: "clientName", header: "Klien" });
  }

  columns.push(
    {
      accessorKey: "category",
      header: "Kategori",
      cell: ({ row }) => documentCategoryLabel[row.original.category] ?? row.original.category,
    },
    {
      accessorKey: "fileSize",
      header: "Ukuran",
      cell: ({ row }) => formatFileSize(row.original.fileSize),
    },
    { accessorKey: "uploaderName", header: "Diunggah oleh" },
    {
      accessorKey: "createdAt",
      header: "Tanggal",
      cell: ({ row }) => row.original.createdAt.toLocaleDateString("id-ID"),
    },
    {
      id: "shared",
      header: "Status",
      cell: ({ row }) =>
        isAdmin ? (
          <DocumentShareToggle
            documentId={row.original.id}
            sharedWithClient={row.original.sharedWithClient}
          />
        ) : row.original.sharedWithClient ? (
          "Dibagikan"
        ) : (
          "Privat"
        ),
    },
    {
      id: "actions",
      header: "Aksi",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <DocumentPreviewDialog
            name={row.original.name}
            fileUrl={row.original.fileUrl}
            mimeType={row.original.mimeType}
          />
          {isAdmin ? <DeleteDocumentButton documentId={row.original.id} /> : null}
        </div>
      ),
    },
  );

  return columns;
}
