"use server";

import { revalidatePath } from "next/cache";
import {
  archiveEquipmentForUser,
  borrowEquipmentForUser,
  correctUsageForUser,
  createEquipmentForUser,
  returnEquipmentForUser,
  updateEquipmentForUser,
} from "@/lib/actions/equipment-logic";
import {
  archiveEquipmentInputSchema,
  borrowEquipmentInputSchema,
  correctUsageInputSchema,
  createEquipmentInputSchema,
  returnEquipmentInputSchema,
  updateEquipmentInputSchema,
} from "@/lib/actions/equipment-schemas";
import { adminActionClient, staffActionClient } from "@/lib/actions/safe-action";

/**
 * Server action inventaris alat — UNIT FISIK. Logika + guard ada di
 * `equipment-logic.ts` (diuji langsung); `adminActionClient`/`staffActionClient`
 * di sini adalah penegakan pertama yang terikat request — bukan penggantinya,
 * melainkan lapis pertamanya. `borrowEquipment`/`returnEquipment` memakai
 * `staffActionClient` karena surveyor perlu memanggilnya; sisanya admin-only.
 */

export const createEquipment = adminActionClient
  .inputSchema(createEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await createEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });

export const updateEquipment = adminActionClient
  .inputSchema(updateEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await updateEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${item.id}`);
    return { success: true as const, item };
  });

export const archiveEquipment = adminActionClient
  .inputSchema(archiveEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await archiveEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${item.id}`);
    return { success: true as const, item };
  });

export const borrowEquipment = staffActionClient
  .inputSchema(borrowEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await borrowEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });

export const returnEquipment = staffActionClient
  .inputSchema(returnEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await returnEquipmentForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });

export const correctUsage = adminActionClient
  .inputSchema(correctUsageInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await correctUsageForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });
