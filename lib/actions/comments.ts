"use server";

import { revalidatePath } from "next/cache";
import {
  createCommentForUser,
  listCommentsForProject,
  markProjectCommentsReadForUser,
} from "@/lib/actions/comments-logic";
import {
  createCommentSchema,
  listCommentsSchema,
  markCommentsReadSchema,
} from "@/lib/actions/comments-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Wrapper "use server" untuk aksi komentar (F-2025-07-005).
 * Tipis: validasi Zod → panggil logic → revalidatePath.
 * Semua guard RBAC ada di `comments-logic.ts` (assertCan + requireScopedRow).
 */

export const listComments = rbacActionClient
  .metadata({ permission: "comment.read" })
  .schema(listCommentsSchema)
  .action(async ({ parsedInput, ctx }) => {
    return listCommentsForProject(ctx.rbac, parsedInput);
  });

export const createComment = rbacActionClient
  .metadata({ permission: "comment.create" })
  .schema(createCommentSchema)
  .action(async ({ parsedInput, ctx }) => {
    const row = await createCommentForUser(ctx.rbac, parsedInput);
    // Segarkan halaman proyek (dashboard + portal) supaya pesan baru muncul.
    revalidatePath(`/dashboard/projects/${parsedInput.projectId}`);
    revalidatePath(`/portal/projects/${parsedInput.projectId}`);
    return row;
  });

export const markCommentsRead = rbacActionClient
  .metadata({ permission: "comment.read" })
  .schema(markCommentsReadSchema)
  .action(async ({ parsedInput, ctx }) => {
    await markProjectCommentsReadForUser(ctx.rbac, parsedInput);
  });
