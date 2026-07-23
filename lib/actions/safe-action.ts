import { createSafeActionClient } from "next-safe-action";
import { z } from "zod";
import { assertCan } from "@/lib/rbac/can";
import { getRbacContext } from "@/lib/rbac/context";
import { PERMISSIONS, type Permission } from "@/lib/rbac/resources";

/**
 * Client RBAC tunggal — satu-satunya jalan membuat server action. `ctx.rbac`
 * diisi `getRbacContext()`, dan setiap action WAJIB mendeklarasikan
 * permission-nya lewat `.metadata({ permission })`. Tanpa metadata → gerbang
 * menolak (fail-closed): action yang lupa gerbangnya tidak pernah lolos
 * diam-diam. Row-level scoping (`requireScopedRow`) tetap di `*-logic.ts`
 * tempat id-nya tersedia.
 *
 * Ini satu-satunya tempat `createSafeActionClient` di codebase boleh hidup:
 * file batas-auth ini, yang langsung merangkai middleware-nya sendiri.
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
