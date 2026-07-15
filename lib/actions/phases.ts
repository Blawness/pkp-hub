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
import { adminActionClient, staffActionClient } from "@/lib/actions/safe-action";

/**
 * Server action timeline fase. Logika + guard ada di `phases-logic.ts` (diuji
 * langsung); klien di sini adalah lapis PERTAMA penegakan, bukan penggantinya.
 *
 * `adminActionClient` untuk yang mengubah RENCANA; `staffActionClient` untuk
 * yang melaporkan PEKERJAAN (guard row-level-nya tetap di logic layer, yang
 * memastikan surveyor cuma menyentuh proyek yang boleh ia sentuh).
 */

function revalidateProject(projectId: string) {
  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/portal/projects/${projectId}`);
}

export const createPhase = adminActionClient
  .inputSchema(createPhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await createPhaseForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const updatePhase = adminActionClient
  .inputSchema(updatePhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await updatePhaseForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const deletePhase = adminActionClient
  .inputSchema(deletePhaseInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { projectId } = await deletePhaseForUser(ctx.user, parsedInput);
    revalidateProject(projectId);
    return { success: true as const };
  });

export const reorderPhases = adminActionClient
  .inputSchema(reorderPhasesInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phases = await reorderPhasesForUser(ctx.user, parsedInput);
    revalidateProject(parsedInput.projectId);
    return { success: true as const, phases };
  });

export const setPhaseStatus = staffActionClient
  .inputSchema(setPhaseStatusInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await setPhaseStatusForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });

export const updatePhaseNote = staffActionClient
  .inputSchema(updatePhaseNoteInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const phase = await updatePhaseNoteForUser(ctx.user, parsedInput);
    revalidateProject(phase.projectId);
    return { success: true as const, phase };
  });
