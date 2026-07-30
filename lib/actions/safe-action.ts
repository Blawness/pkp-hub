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
    // Jangan bocorkan detail error ke klien di production — pesan asli
    // (hostname DB, nama bucket, SQL state) adalah informasi internal.
    // App-level Error yang kami lempar sudah berbahasa Indonesia dan
    // aman; `handleServerError` ini menangkap sisanya (unexpected).
    if (process.env.NODE_ENV !== "production" && error instanceof Error) {
      return error.message;
    }
    return "Terjadi kesalahan tak terduga. Silakan coba lagi.";
  },
  defineMetadataSchema: () => permissionMetadataSchema,
})
  .use(async ({ next }) => next({ ctx: { rbac: await getRbacContext() } }))
  .use(async ({ next, ctx, metadata }) => {
    if (!metadata?.permission) throw new Error("rbac: action tanpa permission.");
    assertCan(ctx.rbac, metadata.permission);
    return next({ ctx });
  });
