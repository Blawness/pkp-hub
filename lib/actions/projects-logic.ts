import { eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projectStatusLogs, projects } from "@/lib/db/schema";
import type {
  AssignSurveyorInput,
  ChangeProjectStatusInput,
  ProjectInput,
  UpdateProjectInput,
} from "./projects-schemas";

/**
 * Server-only business logic for project CRUD + status pipeline, separated
 * from the "use server" action wrappers in `projects.ts` so it's directly
 * unit-testable (next-safe-action's `requireUser()` needs `next/headers`'
 * request scope, which plain vitest doesn't have). Every function re-checks
 * the caller's role/scoping itself — defense in depth alongside
 * `ownerActionClient` / `staffActionClient` in `projects.ts`, not a
 * replacement for it.
 *
 * CRITICAL: any function here that reads a specific project MUST go through
 * `assertProjectAccess` — never a raw `db.select()` — that's the row-level
 * scoping boundary (surveyor sees only their assigned projects, client sees
 * only their own).
 */

function requireOwner(user: SessionUser) {
  if (user.role !== "owner") {
    throw new Error("Only the owner can perform this action.");
  }
}

function requireStaff(user: SessionUser) {
  if (user.role !== "owner" && user.role !== "surveyor") {
    throw new Error("You do not have permission to perform this action.");
  }
}

function nullableText(value?: string): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createProjectForUser(user: SessionUser, input: ProjectInput) {
  requireOwner(user);
  return db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(projects)
      .values({
        title: input.title,
        clientId: input.clientId,
        surveyType: input.surveyType,
        locationLabel: nullableText(input.locationLabel),
        assignedSurveyorId: nullableText(input.assignedSurveyorId),
        orderDate: input.orderDate ? new Date(input.orderDate) : undefined,
        description: nullableText(input.description),
      })
      .returning();
    await tx.insert(projectStatusLogs).values({
      projectId: inserted.id,
      fromStatus: null,
      toStatus: "baru",
      changedById: user.id,
    });
    return inserted;
  });
}

export async function updateProjectForUser(user: SessionUser, input: UpdateProjectInput) {
  requireOwner(user);
  const [project] = await db
    .update(projects)
    .set({
      title: input.title,
      clientId: input.clientId,
      surveyType: input.surveyType,
      locationLabel: nullableText(input.locationLabel),
      orderDate: input.orderDate ? new Date(input.orderDate) : undefined,
      description: nullableText(input.description),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.id))
    .returning();
  if (!project) throw new Error("Project not found.");
  return project;
}

export async function assignSurveyorForUser(user: SessionUser, input: AssignSurveyorInput) {
  requireOwner(user);
  const [project] = await db
    .update(projects)
    .set({ assignedSurveyorId: nullableText(input.surveyorId), updatedAt: new Date() })
    .where(eq(projects.id, input.projectId))
    .returning();
  if (!project) throw new Error("Project not found.");
  return project;
}

/**
 * Allowed callers: owner, or the surveyor assigned to the project. Writes
 * the project's new status AND a `projectStatusLogs` row in the same
 * transaction.
 */
export async function changeProjectStatusForUser(
  user: SessionUser,
  input: ChangeProjectStatusInput,
) {
  requireStaff(user);

  // `assertProjectAccess` is the row-level scoping boundary: it throws
  // (via `notFound()`) if a surveyor isn't assigned to this project. We
  // translate that into a plain rejection here rather than letting Next's
  // not-found signal escape a server action.
  let project: Awaited<ReturnType<typeof assertProjectAccess>>;
  try {
    project = await assertProjectAccess(input.projectId, user);
  } catch {
    throw new Error("Project not found or you do not have access to it.");
  }

  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(projects)
      .set({ status: input.toStatus, updatedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning();
    await tx.insert(projectStatusLogs).values({
      projectId: project.id,
      fromStatus: project.status,
      toStatus: input.toStatus,
      changedById: user.id,
    });
    return updated;
  });
}

export async function getStatusLogsForProject(projectId: string) {
  return db
    .select()
    .from(projectStatusLogs)
    .where(eq(projectStatusLogs.projectId, projectId))
    .orderBy(projectStatusLogs.createdAt);
}
