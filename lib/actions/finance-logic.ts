import { eq } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { assertProjectAccess } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import type { UpdatePaymentInput } from "./finance-schemas";

/**
 * Server-only business logic for Keuangan Ringan (PRD §3 Feature 5),
 * separated from the "use server" wrapper in `finance.ts` so it's directly
 * unit-testable (see `finance.test.ts`). Re-checks the caller's role itself
 * — defense in depth alongside `adminActionClient` in `finance.ts`, not a
 * replacement for it.
 *
 * CRITICAL: this is OWNER-ONLY, no exceptions — surveyors must never be able
 * to set/read `projectValue` / `paymentStatus` / `paymentNotes` through any
 * path. Any function here that touches a specific project MUST go through
 * `assertProjectAccess` — never a raw `db.select()`/`db.update()` on
 * `projects` guarded only by role.
 */

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Only the admin can manage payments.");
  }
}

/**
 * `notFound()`'s digest for this Next.js version — same rationale as
 * `documents-logic.ts#isNotFoundDigest`: translate `assertProjectAccess`'s
 * 404 signal into a plain rejection instead of letting it escape a server
 * action or a directly-unit-tested function.
 */
function isNotFoundDigest(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;404");
}

async function assertProjectAccessOrReject(projectId: string, user: SessionUser) {
  try {
    return await assertProjectAccess(projectId, user);
  } catch (error) {
    if (isNotFoundDigest(error)) {
      throw new Error("Project not found or you do not have access to it.");
    }
    throw error;
  }
}

/** Admin-only. Sets `projectValue` / `paymentStatus` / `paymentNotes` on a project. */
export async function updatePaymentForUser(user: SessionUser, input: UpdatePaymentInput) {
  requireAdmin(user);
  await assertProjectAccessOrReject(input.projectId, user);

  const [updated] = await db
    .update(projects)
    .set({
      projectValue: input.projectValue,
      paymentStatus: input.paymentStatus,
      paymentNotes: input.paymentNotes && input.paymentNotes.length > 0 ? input.paymentNotes : null,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, input.projectId))
    .returning();
  if (!updated) throw new Error("Project not found.");
  return updated;
}
