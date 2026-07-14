"use server";

import { revalidatePath } from "next/cache";
import {
  recordPaymentForUser,
  regenerateReceiptForUser,
  voidPaymentForUser,
} from "@/lib/actions/payments-logic";
import {
  recordPaymentInputSchema,
  regenerateReceiptInputSchema,
  voidPaymentInputSchema,
} from "@/lib/actions/payments-schemas";
import { adminActionClient } from "@/lib/actions/safe-action";

/**
 * Server action ledger pembayaran. Logika + guard ada di `payments-logic.ts`
 * (diuji langsung); `adminActionClient` di sini adalah penegakan utama aturan
 * admin-only yang terikat request — bukan penggantinya, melainkan lapis
 * pertamanya.
 */

export const recordPayment = adminActionClient
  .inputSchema(recordPaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await recordPaymentForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    revalidatePath("/dashboard");
    return { success: true as const, payment };
  });

export const voidPayment = adminActionClient
  .inputSchema(voidPaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await voidPaymentForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    revalidatePath("/dashboard");
    return { success: true as const, payment };
  });

export const regenerateReceipt = adminActionClient
  .inputSchema(regenerateReceiptInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await regenerateReceiptForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    return { success: true as const, payment };
  });
