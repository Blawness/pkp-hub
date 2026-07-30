import { z } from "zod";

/**
 * Zod schemas untuk aksi komentar (F-2025-07-005).
 * Pola sama dengan `phases-schemas.ts`: input divalidasi di sini,
 * logika bisnis di `comments-logic.ts`, wrapper `"use server"` di `comments.ts`.
 */

export const createCommentSchema = z.object({
  projectId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(1, "Pesan tidak boleh kosong.")
    .max(2000, "Pesan maksimal 2000 karakter."),
});

export const listCommentsSchema = z.object({
  projectId: z.string().uuid(),
});

export const markCommentsReadSchema = z.object({
  projectId: z.string().uuid(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type ListCommentsInput = z.infer<typeof listCommentsSchema>;
export type MarkCommentsReadInput = z.infer<typeof markCommentsReadSchema>;
