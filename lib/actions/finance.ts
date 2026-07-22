"use server";

import { revalidatePath } from "next/cache";
import { updatePaymentForUser } from "@/lib/actions/finance-logic";
import { updatePaymentInputSchema } from "@/lib/actions/finance-schemas";
import { rbacActionClient } from "@/lib/actions/safe-action";

/**
 * Server action for Keuangan Ringan (PRD §3 Feature 5). Business logic +
 * scoping live in `finance-logic.ts` (directly unit tested in
 * `finance.test.ts`); `rbacActionClient` + `.metadata({ permission:
 * "project.updateFinance" })` menegakkan aturan admin-only.
 */
export const updatePayment = rbacActionClient
  .metadata({ permission: "project.updateFinance" })
  .inputSchema(updatePaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await updatePaymentForUser(ctx.rbac, parsedInput);
    revalidatePath(`/dashboard/projects/${project.id}`);
    revalidatePath("/dashboard");
    return { success: true as const, project };
  });
