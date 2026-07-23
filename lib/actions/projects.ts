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
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server actions for project CRUD + status pipeline (PRD §3 Feature 2).
 * Business logic + scoping live in `projects-logic.ts` (directly unit tested
 * in `projects.test.ts`); `rbacActionClient` menegakkan gerbang aksi lewat
 * `.metadata({ permission })`, dan logic-nya menegakkan scope baris.
 */

export const createProject = rbacActionClient
  .metadata({ permission: "project.create" })
  .inputSchema(projectInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await createProjectForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/projects");
    return { success: true as const, project };
  });

export const updateProject = rbacActionClient
  .metadata({ permission: "project.update" })
  .inputSchema(updateProjectInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await updateProjectForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${project.id}`);
    return { success: true as const, project };
  });

/** Admin-only: (re)assign, or unassign (empty string), the surveyor on a project. */
export const assignSurveyor = rbacActionClient
  .metadata({ permission: "project.assignSurveyor" })
  .inputSchema(assignSurveyorInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await assignSurveyorForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/projects");
    revalidatePath(`/dashboard/projects/${project.id}`);
    return { success: true as const, project };
  });

/**
 * Admin or the surveyor assigned to the project. Writes a
 * `projectStatusLogs` row in the same transaction as the status update —
 * see `changeProjectStatusForUser`.
 */
export const changeProjectStatus = rbacActionClient
  .metadata({ permission: "project.changeStatus" })
  .inputSchema(changeProjectStatusInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await changeProjectStatusForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${project.id}`);
    return { success: true as const, project };
  });
