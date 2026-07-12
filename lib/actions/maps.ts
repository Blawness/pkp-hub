"use server";

import { revalidatePath } from "next/cache";
import {
  deleteMapLayerForUser,
  importMapCsvForUser,
  saveMapLayerForUser,
} from "@/lib/actions/maps-logic";
import {
  deleteMapLayerInputSchema,
  importMapCsvInputSchema,
  saveMapLayerInputSchema,
} from "@/lib/actions/maps-schemas";
import { staffActionClient } from "@/lib/actions/safe-action";

/**
 * Server actions for the Peta module (Phase 5 brief, PRD §3 Feature 3).
 * Business logic + role/scoping checks live in `maps-logic.ts` (directly
 * unit tested in `maps.test.ts`); `staffActionClient` here is the primary,
 * request-bound enforcement of the same rules (owner + surveyor only, and
 * only for a project the caller can access via `assertProjectAccess`).
 */

export const saveMapLayer = staffActionClient
  .inputSchema(saveMapLayerInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const layer = await saveMapLayerForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${parsedInput.projectId}`);
    return { success: true as const, layer };
  });

/** CSV text is small — sent straight through the action body (no presigned upload needed). */
export const importMapCsv = staffActionClient
  .inputSchema(importMapCsvInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await importMapCsvForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${parsedInput.projectId}`);
    return { success: true as const, ...result };
  });

export const deleteMapLayer = staffActionClient
  .inputSchema(deleteMapLayerInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const layer = await deleteMapLayerForUser(ctx.user, parsedInput.id);
    revalidatePath(`/dashboard/projects/${layer.projectId}`);
    return { success: true as const };
  });
