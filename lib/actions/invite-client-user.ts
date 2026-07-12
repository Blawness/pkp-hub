import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ownerActionClient } from "@/lib/actions/safe-action";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clients, users } from "@/lib/db/schema";

const inviteClientUserSchema = z.object({
  clientId: z.uuid(),
});

/**
 * Owner-only: given a `clients.id`, create a portal `user` (role client),
 * link it via `clients.userId`, and send a set-password invite.
 *
 * When `RESEND_API_KEY` is absent (this environment), `lib/auth.ts`'s
 * `sendResetPassword` logs the invite URL to the server console instead of
 * emailing it — the invite still succeeds, it never crashes or no-ops.
 */
export const inviteClientUser = ownerActionClient
  .inputSchema(inviteClientUserSchema)
  .action(async ({ parsedInput }) => {
    const [client] = await db.select().from(clients).where(eq(clients.id, parsedInput.clientId));

    if (!client) {
      throw new Error("Client not found.");
    }
    if (client.userId) {
      throw new Error("This client already has a portal account.");
    }
    if (!client.email) {
      throw new Error("This client has no email on file to invite.");
    }

    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      name: client.name,
      email: client.email,
      role: "client",
    });
    await db.update(clients).set({ userId }).where(eq(clients.id, client.id));

    await auth.api.requestPasswordReset({
      body: {
        email: client.email,
        redirectTo: "/set-password",
      },
    });

    return { success: true as const, clientId: client.id, userId };
  });
