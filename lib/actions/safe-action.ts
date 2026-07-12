import { createSafeActionClient } from "next-safe-action";
import type { Role } from "@/lib/auth-guards";
import { requireUser } from "@/lib/auth-guards";

/**
 * Shared next-safe-action client. Every later phase's server actions build
 * on `authActionClient` (or `ownerActionClient`) — never construct a bare
 * `createSafeActionClient()` action elsewhere, or the auth boundary gets
 * bypassed.
 */
export const actionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof Error) return error.message;
    return "Unexpected error.";
  },
});

/** Requires an authenticated user (any role). Redirects to /login if not. */
export const authActionClient = actionClient.use(async ({ next }) => {
  const user = await requireUser();
  return next({ ctx: { user } });
});

function forRoles(...roles: Role[]) {
  return authActionClient.use(async ({ next, ctx }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new Error("You do not have permission to perform this action.");
    }
    return next({ ctx });
  });
}

/** Requires the `owner` role. */
export const ownerActionClient = forRoles("owner");

/** Requires `owner` or `surveyor` (staff). */
export const staffActionClient = forRoles("owner", "surveyor");
