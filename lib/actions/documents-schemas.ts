import { z } from "zod";

/**
 * Shared zod schemas for document upload/share/delete/search, mirroring
 * `clients-schemas.ts` / `projects-schemas.ts`'s split between plain schema
 * definitions (consumed by both the unit-testable `*-logic.ts` module and
 * the "use server" action wrappers) and the actions themselves.
 */
export const documentCategorySchema = z.enum([
  "laporan",
  "berita_acara",
  "foto_lapangan",
  "sertifikat",
  "data_mentah",
  "lainnya",
]);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

/** Metadata persisted AFTER the bytes have already landed in storage. */
export const uploadDocumentInputSchema = z.object({
  projectId: z.uuid(),
  name: z.string().trim().min(1, "Nama dokumen wajib diisi."),
  category: documentCategorySchema,
  fileUrl: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().trim().min(1),
});
export type UploadDocumentInput = z.infer<typeof uploadDocumentInputSchema>;

export const toggleDocumentShareInputSchema = z.object({
  id: z.uuid(),
  sharedWithClient: z.boolean(),
});
export type ToggleDocumentShareInput = z.infer<typeof toggleDocumentShareInputSchema>;

export const deleteDocumentInputSchema = z.object({ id: z.uuid() });
export type DeleteDocumentInput = z.infer<typeof deleteDocumentInputSchema>;

export const searchDocumentsInputSchema = z.object({
  q: z.string().trim().optional(),
  category: documentCategorySchema.optional(),
  clientId: z.uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export type SearchDocumentsInput = z.infer<typeof searchDocumentsInputSchema>;

/** Request body for the `upload-init` route handler (issues the upload target). */
export const uploadInitInputSchema = z.object({
  projectId: z.uuid(),
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
});
export type UploadInitInput = z.infer<typeof uploadInitInputSchema>;
