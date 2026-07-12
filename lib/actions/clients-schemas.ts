import { z } from "zod";

/**
 * Shared zod schemas for client CRUD. Not a "use server" module — plain
 * schema/type definitions consumed by both `clients-logic.ts` (server-only
 * business logic, directly unit-testable) and `clients.ts` (the "use
 * server" action wrappers built on `ownerActionClient`).
 */
export const clientInputSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi."),
  type: z.enum(["individual", "company"]),
  phone: z.string().trim().optional(),
  email: z.union([z.email("Email tidak valid."), z.literal("")]).optional(),
  address: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type ClientInput = z.infer<typeof clientInputSchema>;

export const updateClientInputSchema = clientInputSchema.extend({ id: z.uuid() });
export type UpdateClientInput = z.infer<typeof updateClientInputSchema>;

export const archiveClientInputSchema = z.object({ id: z.uuid() });
export type ArchiveClientInput = z.infer<typeof archiveClientInputSchema>;
