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
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server actions for the Peta module (PRD §3 Feature 3). Business logic +
 * scoping live in `maps-logic.ts` (directly unit tested in `maps.test.ts`);
 * `rbacActionClient` + `.metadata({ permission: "map.write" })` di sini adalah
 * gerbang aksi, dan logic menegakkan scope baris (hanya proyek yang boleh
 * diakses pemanggil).
 */

export const saveMapLayer = rbacActionClient
  .metadata({ permission: "map.write" })
  .inputSchema(saveMapLayerInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const layer = await saveMapLayerForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${parsedInput.projectId}`);
    return { success: true as const, layer };
  });

/** CSV text is small — sent straight through the action body (no presigned upload needed). */
export const importMapCsv = rbacActionClient
  .metadata({ permission: "map.write" })
  .inputSchema(importMapCsvInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await importMapCsvForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${parsedInput.projectId}`);
    return { success: true as const, ...result };
  });

export const deleteMapLayer = rbacActionClient
  .metadata({ permission: "map.write" })
  .inputSchema(deleteMapLayerInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const layer = await deleteMapLayerForUser(ctx.rbac, parsedInput.id);
    revalidatePath(`/dashboard/projects/${layer.projectId}`);
    return { success: true as const };
  });
