"use server";

import { revalidatePath } from "next/cache";
import {
  deleteDocumentForUser,
  toggleDocumentShareForUser,
  uploadDocumentForUser,
} from "@/lib/actions/documents-logic";
import {
  deleteDocumentInputSchema,
  toggleDocumentShareInputSchema,
  uploadDocumentInputSchema,
} from "@/lib/actions/documents-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server actions for the document archive (PRD §3 Feature 4). Business
 * logic + role/scoping checks live in `documents-logic.ts` (directly unit
 * tested in `documents.test.ts`); the safe-action clients here are the
 * primary, request-bound enforcement of the same rules.
 *
 * The file bytes themselves never pass through these actions — they're
 * uploaded directly (route handler `/api/documents/upload-init` +
 * `/api/storage/[...key]`, see `lib/storage`) to stay under the ~4.5MB
 * server-action body limit. These actions only persist/mutate metadata
 * after the bytes have already landed.
 */

export const uploadDocument = rbacActionClient
  .metadata({ permission: "document.upload" })
  .inputSchema(uploadDocumentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const document = await uploadDocumentForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${parsedInput.projectId}`);
    revalidatePath("/dashboard/documents");
    return { success: true as const, document };
  });

/** Admin-only: set/unset `sharedWithClient`. */
export const toggleDocumentShare = rbacActionClient
  .metadata({ permission: "document.share" })
  .inputSchema(toggleDocumentShareInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const document = await toggleDocumentShareForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${document.projectId}`);
    revalidatePath("/dashboard/documents");
    return { success: true as const, document };
  });

/** Admin-only: deletes the metadata row AND the object in storage. */
export const deleteDocument = rbacActionClient
  .metadata({ permission: "document.delete" })
  .inputSchema(deleteDocumentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const document = await deleteDocumentForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${document.projectId}`);
    revalidatePath("/dashboard/documents");
    return { success: true as const };
  });
