"use server";

import { revalidatePath } from "next/cache";
import {
  createEquipmentItemForUser,
  updateEquipmentItemForUser,
} from "@/lib/actions/equipment-items-logic";
import {
  createEquipmentItemInputSchema,
  updateEquipmentItemInputSchema,
} from "@/lib/actions/equipment-items-schemas";
import { adminActionClient } from "@/lib/actions/safe-action";

/**
 * Server action jenis alat. Logika + guard ada di `equipment-items-logic.ts`
 * (diuji langsung); `adminActionClient` di sini adalah lapis pertama yang
 * terikat request — bukan penggantinya.
 */

export const createEquipmentItem = adminActionClient
  .inputSchema(createEquipmentItemInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await createEquipmentItemForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });

export const updateEquipmentItem = adminActionClient
  .inputSchema(updateEquipmentItemInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const item = await updateEquipmentItemForUser(ctx.user, parsedInput);
    revalidatePath("/dashboard/equipment");
    return { success: true as const, item };
  });
