"use server";

import { revalidatePath } from "next/cache";
import {
  assignSurveyorForUser,
  changeProjectStatusForUser,
  createProjectForUser,
  updateProjectForUser,
} from "@/lib/actions/projects-logic";
import {
  assignSurveyorInputSchema,
  changeProjectStatusInputSchema,
  projectInputSchema,
  updateProjectInputSchema,
} from "@/lib/actions/projects-schemas";
import { adminActionClient, staffActionClient } from "@/lib/actions/safe-action";

/**
 * Server actions for project CRUD + status pipeline (PRD §3 Feature 2).
 * Business logic + role/scoping checks live in `projects-logic.ts` (directly
 * unit tested in `projects.test.ts`); the safe-action clients here are the
 * primary, request-bound enforcement of the same rules.
 */

export const createProject = adminActionClient
  .inputSchema(projectInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await createProjectForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/projects");
    return { success: true as const, project };
  });

export const updateProject = adminActionClient
  .inputSchema(updateProjectInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await updateProjectForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${project.id}`);
    return { success: true as const, project };
  });

/** Admin-only: (re)assign, or unassign (empty string), the surveyor on a project. */
export const assignSurveyor = adminActionClient
  .inputSchema(assignSurveyorInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await assignSurveyorForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${project.id}`);
    return { success: true as const, project };
  });

/**
 * Admin or the surveyor assigned to the project. Writes a
 * `projectStatusLogs` row in the same transaction as the status update —
 * see `changeProjectStatusForUser`.
 */
export const changeProjectStatus = staffActionClient
  .inputSchema(changeProjectStatusInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await changeProjectStatusForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${project.id}`);
    return { success: true as const, project };
  });
