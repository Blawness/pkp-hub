"use server";

import { revalidatePath } from "next/cache";
import { updatePaymentForUser } from "@/lib/actions/finance-logic";
import { updatePaymentInputSchema } from "@/lib/actions/finance-schemas";
import { adminActionClient } from "@/lib/actions/safe-action";

/**
 * Server action for Keuangan Ringan (PRD §3 Feature 5). Business logic +
 * role/scoping checks live in `finance-logic.ts` (directly unit tested in
 * `finance.test.ts`); `adminActionClient` here is the primary,
 * request-bound enforcement of the same admin-only rule.
 */
export const updatePayment = adminActionClient
  .inputSchema(updatePaymentInputSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await updatePaymentForUser(ctx.user, parsedInput);
    revalidatePath(`/dashboard/projects/${project.id}`);
    revalidatePath("/dashboard");
    return { success: true as const, project };
  });
