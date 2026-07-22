import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import type { Role } from "@/lib/auth-guards";
import { requireUser } from "@/lib/auth-guards";
import { assertCan } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { PERMISSIONS, type Permission } from "@/lib/rbac/resources";

/**
 * Shared next-safe-action client. Every later phase's server actions build
 * on `authActionClient` (or `adminActionClient`) — never construct a bare
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

/** Requires the `admin` role. */
export const adminActionClient = forRoles("admin");

/** Requires `admin` or `surveyor` (staff). */
export const staffActionClient = forRoles("admin", "surveyor");

/**
 * Client RBAC tunggal — pengganti `admin`/`staffActionClient` (yang dibuang di
 * pass terakhir migrasi). `ctx.rbac` diisi `getRbacContext()`, dan setiap
 * action WAJIB mendeklarasikan permission-nya lewat `.metadata({ permission })`.
 * Tanpa metadata → gerbang menolak (fail-closed): action yang lupa gerbangnya
 * tidak pernah lolos diam-diam. Row-level scoping (`requireScopedRow`) tetap di
 * `*-logic.ts` tempat id-nya tersedia.
 *
 * Ini satu-satunya tempat kedua `createSafeActionClient` di codebase boleh
 * hidup: file batas-auth ini, yang langsung merangkai middleware-nya sendiri.
 */
const permissionMetadataSchema = z.object({
  permission: z.custom<Permission>(
    (v) => typeof v === "string" && (PERMISSIONS as readonly string[]).includes(v),
    "permission tidak dikenal katalog",
  ),
});

export const rbacActionClient = createSafeActionClient({
  handleServerError(error) {
    if (error instanceof Error) return error.message;
    return "Unexpected error.";
  },
  defineMetadataSchema: () => permissionMetadataSchema,
})
  .use(async ({ next }) => next({ ctx: { rbac: await getRbacContext() } }))
  .use(async ({ next, ctx, metadata }) => {
    if (!metadata?.permission) throw new Error("rbac: action tanpa permission.");
    assertCan(ctx.rbac, metadata.permission);
    return next({ ctx });
  });
