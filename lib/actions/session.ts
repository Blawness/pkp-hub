"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rbacActionClient } from "@/lib/actions/safe-action";
import { bulkRevokeSessions, revokeSession } from "@/lib/actions/session-logic";

const PATH = "/dashboard/settings/sessions";

export const revokeSessionAction = rbacActionClient
  .metadata({ permission: "session.revoke" })
  .inputSchema(z.object({ sessionId: z.string() }))
  .action(async ({ parsedInput, ctx }) => {
    await revokeSession(ctx.rbac, parsedInput.sessionId);
    revalidatePath(PATH);
    return { success: true as const };
  });

export const bulkRevokeSessionsAction = rbacActionClient
  .metadata({ permission: "session.revoke" })
  .inputSchema(z.object({ sessionIds: z.array(z.string()).min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    const count = await bulkRevokeSessions(ctx.rbac, parsedInput.sessionIds);
    revalidatePath(PATH);
    return { success: true as const, count };
  });
