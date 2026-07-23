"use server";

import { revalidatePath } from "next/cache";
import {
  createPhaseForUser,
  deletePhaseForUser,
  reorderPhasesForUser,
  setPhaseStatusForUser,
  updatePhaseForUser,
  updatePhaseNoteForUser,
} from "@/lib/actions/phases-logic";
import {
  createPhaseInputSchema,
  deletePhaseInputSchema,
  reorderPhasesInputSchema,
  setPhaseStatusInputSchema,
  updatePhaseInputSchema,
  updatePhaseNoteInputSchema,
} from "@/lib/actions/phases-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server action timeline fase. Logika + guard ada di `phases-logic.ts` (diuji
 * langsung); `rbacActionClient` + `.metadata` adalah lapis PERTAMA penegakan.
 *
 * `phase.create/update/delete/reorder` (admin-only) mengubah RENCANA;
 * `phase.setStatus`/`.updateNote` (juga surveyor ber-akses) melaporkan
 * PEKERJAAN. Scope row-level tetap di logic layer.
 */

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export const createPhase = rbacActionClient
  .metadata({ permission: "phase.create" })
  .inputSchema(createPhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await createPhaseForUser(ctx.rbac, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const updatePhase = rbacActionClient
  .metadata({ permission: "phase.update" })
  .inputSchema(updatePhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await updatePhaseForUser(ctx.rbac, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const deletePhase = rbacActionClient
  .metadata({ permission: "phase.delete" })
  .inputSchema(deletePhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = await deletePhaseForUser(ctx.rbac, parsedInput);
    revalidateProject(projectId);
    return { success: true as const };
  });

export const reorderPhases = rbacActionClient
  .metadata({ permission: "phase.reorder" })
  .inputSchema(reorderPhasesInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phases = await reorderPhasesForUser(ctx.rbac, parsedInput);
    revalidateProject(parsedInput.projectId);
    return { success: true as const, phases };
  });

export const setPhaseStatus = rbacActionClient
  .metadata({ permission: "phase.setStatus" })
  .inputSchema(setPhaseStatusInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await setPhaseStatusForUser(ctx.rbac, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const updatePhaseNote = rbacActionClient
  .metadata({ permission: "phase.updateNote" })
  .inputSchema(updatePhaseNoteInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await updatePhaseNoteForUser(ctx.rbac, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });
