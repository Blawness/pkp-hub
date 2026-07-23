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
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server action inventaris alat — UNIT FISIK. Logika + guard ada di
 * `equipment-logic.ts` (diuji langsung); `rbacActionClient` + `.metadata` di
 * sini adalah gerbang aksi. `equipment.borrow`/`.return` juga dimiliki surveyor
 * (scope `all` — inventaris tidak per-proyek); sisanya admin-only.
 */

export const createEquipment = rbacActionClient
  .metadata({ permission: "equipment.create" })
  .inputSchema(createEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await createEquipmentForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });

export const updateEquipment = rbacActionClient
  .metadata({ permission: "equipment.update" })
  .inputSchema(updateEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await updateEquipmentForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${item.id}`);
    return { success: true as const, item };
  });

export const archiveEquipment = rbacActionClient
  .metadata({ permission: "equipment.archive" })
  .inputSchema(archiveEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await archiveEquipmentForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${item.id}`);
    return { success: true as const, item };
  });

export const borrowEquipment = rbacActionClient
  .metadata({ permission: "equipment.borrow" })
  .inputSchema(borrowEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await borrowEquipmentForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });

export const returnEquipment = rbacActionClient
  .metadata({ permission: "equipment.return" })
  .inputSchema(returnEquipmentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await returnEquipmentForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });

export const correctUsage = rbacActionClient
  .metadata({ permission: "equipment.correctUsage" })
  .inputSchema(correctUsageInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const usage = await correctUsageForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    revalidatePath(`/dashboard/equipment/unit/${usage.equipmentId}`);
    revalidatePath(`/dashboard/projects/${usage.projectId}`);
    return { success: true as const, usage };
  });
