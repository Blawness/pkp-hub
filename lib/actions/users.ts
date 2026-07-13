"use server";

import { revalidatePath } from "next/cache";
import { adminActionClient } from "@/lib/actions/safe-action";
import {
  archiveUser,
  createStaffUser,
  restoreUser,
  setUserName,
  setUserPassword,
  setUserRole,
} from "@/lib/actions/users-logic";
import {
  createStaffUserSchema,
  setUserNameSchema,
  setUserPasswordSchema,
  setUserRoleSchema,
  userIdSchema,
} from "@/lib/actions/users-schemas";

/**
 * Server actions manajemen user. Semuanya lewat `adminActionClient` — surveyor
 * dan klien ditolak di sini, sebelum satu baris logic pun berjalan.
 *
 * Aturan siapa-boleh-apa (admin terakhir, tidak boleh menyentuh diri sendiri)
 * TIDAK tinggal di sini melainkan di `users-logic.ts`, supaya bisa diuji tanpa
 * request — dan supaya tidak ada jalan memanggil logic-nya tanpa aturan itu
 * ikut berlaku.
 */

const USERS_PATH = "/dashboard/settings/users";

export const createStaffUserAction = adminActionClient
  .inputSchema(createStaffUserSchema)
  .action(async ({ parsedInput }) => {
    const { id } = await createStaffUser(parsedInput);
    revalidatePath(USERS_PATH);
    return { success: true as const, id };
  });

export const setUserRoleAction = adminActionClient
  .inputSchema(setUserRoleSchema)
  .action(async ({ parsedInput, ctx }) => {
    await setUserRole(ctx.user, parsedInput.userId, parsedInput.role);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });

export const setUserNameAction = adminActionClient
  .inputSchema(setUserNameSchema)
  .action(async ({ parsedInput }) => {
    await setUserName(parsedInput.userId, parsedInput.name);
    // Bukan `revalidatePath(USERS_PATH)`: nama user juga dirender oleh sidebar
    // di layout /dashboard. Kalau admin mengganti namanya sendiri dan kita cuma
    // membuang cache halaman user, tabelnya berubah tapi namanya di sidebar
    // tetap yang lama. Membuang cache layout-nya mencakup keduanya.
    revalidatePath("/dashboard", "layout");
    return { success: true as const };
  });

export const setUserPasswordAction = adminActionClient
  .inputSchema(setUserPasswordSchema)
  .action(async ({ parsedInput }) => {
    await setUserPassword(parsedInput.userId, parsedInput.password);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });

export const archiveUserAction = adminActionClient
  .inputSchema(userIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await archiveUser(ctx.user, parsedInput.userId);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });

export const restoreUserAction = adminActionClient
  .inputSchema(userIdSchema)
  .action(async ({ parsedInput }) => {
    await restoreUser(parsedInput.userId);
    revalidatePath(USERS_PATH);
    return { success: true as const };
  });
