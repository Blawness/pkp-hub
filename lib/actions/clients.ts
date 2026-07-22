"use server";

import { revalidatePath } from "next/cache";
import {
  archiveClientForUser,
  createClientForUser,
  updateClientForUser,
} from "@/lib/actions/clients-logic";
import {
  archiveClientInputSchema,
  clientInputSchema,
  updateClientInputSchema,
} from "@/lib/actions/clients-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Admin-only server actions for client CRUD (PRD §3 Feature 1). Business
 * logic + the role check itself live in `clients-logic.ts` (directly unit
 * tested in `clients.test.ts`); `adminActionClient` here is the primary,
 * request-bound enforcement of the same rule.
 */

export const createClient = rbacActionClient
  .metadata({ permission: "client.create" })
  .inputSchema(clientInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const client = await createClientForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/clients");
    return { success: true as const, client };
  });

export const updateClient = rbacActionClient
  .metadata({ permission: "client.update" })
  .inputSchema(updateClientInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const client = await updateClientForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/clients");
    revalidatePath(`/dashboard/clients/${client.id}`);
    return { success: true as const, client };
  });

export const archiveClient = rbacActionClient
  .metadata({ permission: "client.archive" })
  .inputSchema(archiveClientInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const client = await archiveClientForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/clients");
    revalidatePath(`/dashboard/clients/${client.id}`);
    return { success: true as const, client };
  });
