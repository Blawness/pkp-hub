"use server";

import { revalidatePath } from "next/cache";
import {
  assignRole,
  createRole,
  deleteRole,
  unassignRole,
  updateRole,
} from "@/lib/actions/roles-logic";
import {
  assignRoleSchema,
  createRoleSchema,
  deleteRoleSchema,
  unassignRoleSchema,
  updateRoleSchema,
} from "@/lib/actions/roles-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server actions manajemen role. Semuanya lewat `rbacActionClient` dengan
 * permission `role.*` — hanya `superuser` yang punya di matrix, admin biasa
 * ditolak di sini sebelum satu baris logic pun berjalan.
 *
 * `listRoles`/`listExtraRoleAssignments`/`listAssignableUsers` TIDAK punya
 * wrapper action: keduanya dipanggil langsung dari Server Component
 * (`app/dashboard/settings/roles/page.tsx`), pola yang sama dengan
 * `listUsers` di `users/page.tsx`.
 */

const ROLES_PATH = "/dashboard/settings/roles";

export const createRoleAction = rbacActionClient
  .metadata({ permission: "role.create" })
  .inputSchema(createRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id } = await createRole(ctx.rbac, parsedInput);
    revalidatePath(ROLES_PATH);
    return { success: true as const, id };
  });

export const updateRoleAction = rbacActionClient
  .metadata({ permission: "role.update" })
  .inputSchema(updateRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await updateRole(ctx.rbac, parsedInput);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });

export const deleteRoleAction = rbacActionClient
  .metadata({ permission: "role.delete" })
  .inputSchema(deleteRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await deleteRole(ctx.rbac, parsedInput.roleId);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });

export const assignRoleAction = rbacActionClient
  .metadata({ permission: "role.assign" })
  .inputSchema(assignRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await assignRole(ctx.rbac, parsedInput.userId, parsedInput.roleId);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });

export const unassignRoleAction = rbacActionClient
  .metadata({ permission: "role.assign" })
  .inputSchema(unassignRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await unassignRole(ctx.rbac, parsedInput.userId, parsedInput.roleId);
    revalidatePath(ROLES_PATH);
    return { success: true as const };
  });
