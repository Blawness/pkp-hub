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
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server action ledger pembayaran. Logika + guard ada di `payments-logic.ts`
 * (diuji langsung); `rbacActionClient` + `.metadata` di sini adalah gerbang
 * aksi (semua admin-only: `payment.record/void/regenerateReceipt`).
 */

export const recordPayment = rbacActionClient
  .metadata({ permission: "payment.record" })
  .inputSchema(recordPaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await recordPaymentForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    revalidatePath("/dashboard");
    return { success: true as const, payment };
  });

export const voidPayment = rbacActionClient
  .metadata({ permission: "payment.void" })
  .inputSchema(voidPaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await voidPaymentForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    revalidatePath("/dashboard");
    return { success: true as const, payment };
  });

export const regenerateReceipt = rbacActionClient
  .metadata({ permission: "payment.regenerateReceipt" })
  .inputSchema(regenerateReceiptInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const payment = await regenerateReceiptForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${payment.projectId}`);
    return { success: true as const, payment };
  });
