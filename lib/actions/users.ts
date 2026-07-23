"use server";

import { revalidatePath } from "next/cache";
import { rbacActionClient } from "@/lib/actions/safe-action";
import {
  archiveUser,
  createClientUser,
  createStaffUser,
  restoreUser,
  setUserName,
  setUserPassword,
  setUserRole,
} from "@/lib/actions/users-logic";
import {
  createClientUserSchema,
  createStaffUserSchema,
  setUserNameSchema,
  setUserPasswordSchema,
  setUserRoleSchema,
  userIdSchema,
} from "@/lib/actions/users-schemas";

/**
 * Server actions manajemen user. Semuanya lewat `rbacActionClient` dengan
 * permission `user.*` — surveyor dan klien ditolak di sini, sebelum satu
 * baris logic pun berjalan.
 *
 * Aturan siapa-boleh-apa (admin terakhir, tidak boleh menyentuh diri sendiri)
 * TIDAK tinggal di sini melainkan di `users-logic.ts`, supaya bisa diuji tanpa
 * request — dan supaya tidak ada jalan memanggil logic-nya tanpa aturan itu
 * ikut berlaku.
 */

const USERS_PATH = "/dashboard/settings/users";

export const createStaffUserAction = rbacActionClient
  .metadata({ permission: "user.create" })
  .inputSchema(createStaffUserSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id } = await createStaffUser(ctx.rbac, parsedInput);
    revalidatePath(USERS_PATH);
    return { success: true as const, id };
  });

export const createClientUserAction = rbacActionClient
  .metadata({ permission: "user.create" })
  .inputSchema(createClientUserSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, clientId } = await createClientUser(ctx.rbac, parsedInput);
    revalidatePath(USERS_PATH);
    revalidatePath("/dashboard/clients");
    return { success: true as const, id, clientId };
  });

export const setUserRoleAction = rbacActionClient
  .metadata({ permission: "user.setRole" })
  .inputSchema(setUserRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await setUserRole(ctx.rbac, parsedInput.userId, parsedInput.role);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });

export const setUserNameAction = rbacActionClient
  .metadata({ permission: "user.update" })
  .inputSchema(setUserNameSchema)
  .action(async ({ parsedInput, ctx }) => {
    await setUserName(ctx.rbac, parsedInput.userId, parsedInput.name);
    // Bukan `revalidatePath(USERS_PATH)`: nama user juga dirender oleh sidebar
    // di layout /dashboard. Kalau admin mengganti namanya sendiri dan kita cuma
    // membuang cache halaman user, tabelnya berubah tapi namanya di sidebar
    // tetap yang lama. Membuang cache layout-nya mencakup keduanya.
    revalidatePath("/dashboard", "layout");
    return { success: true as const };
  });

export const setUserPasswordAction = rbacActionClient
  .metadata({ permission: "user.update" })
  .inputSchema(setUserPasswordSchema)
  .action(async ({ parsedInput, ctx }) => {
    await setUserPassword(ctx.rbac, parsedInput.userId, parsedInput.password);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });

export const archiveUserAction = rbacActionClient
  .metadata({ permission: "user.archive" })
  .inputSchema(userIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await archiveUser(ctx.rbac, parsedInput.userId);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });

export const restoreUserAction = rbacActionClient
  .metadata({ permission: "user.restore" })
  .inputSchema(userIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await restoreUser(ctx.rbac, parsedInput.userId);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });
