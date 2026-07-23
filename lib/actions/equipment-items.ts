"use server";

import { revalidatePath } from "next/cache";
import {
  archiveEquipmentItemForUser,
  createEquipmentItemForUser,
  updateEquipmentItemForUser,
} from "@/lib/actions/equipment-items-logic";
import {
  archiveEquipmentItemInputSchema,
  createEquipmentItemInputSchema,
  updateEquipmentItemInputSchema,
} from "@/lib/actions/equipment-items-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server action jenis alat. Logika + guard ada di `equipment-items-logic.ts`
 * (diuji langsung); `rbacActionClient` di sini adalah lapis pertama yang
 * terikat request — bukan penggantinya.
 */

export const createEquipmentItem = rbacActionClient
  .metadata({ permission: "equipmentItem.create" })
  .inputSchema(createEquipmentItemInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await createEquipmentItemForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });

export const updateEquipmentItem = rbacActionClient
  .metadata({ permission: "equipmentItem.update" })
  .inputSchema(updateEquipmentItemInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await updateEquipmentItemForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });

export const archiveEquipmentItem = rbacActionClient
  .metadata({ permission: "equipmentItem.archive" })
  .inputSchema(archiveEquipmentItemInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await archiveEquipmentItemForUser(ctx.rbac, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });
