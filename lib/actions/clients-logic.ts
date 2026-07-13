import { eq, isNull } from "drizzle-orm";
import type { SessionUser } from "@/lib/auth-guards";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import type { ArchiveClientInput, ClientInput, UpdateClientInput } from "./clients-schemas";

/**
 * Server-only business logic for client CRUD, deliberately separated from
 * the "use server" action wrappers in `clients.ts` so it can be unit tested
 * directly (next-safe-action's `requireUser()` needs `next/headers`' request
 * scope, which plain vitest doesn't have). Every function re-checks the
 * caller's role itself — this is defense in depth alongside
 * `adminActionClient` in `clients.ts`, not a replacement for it. If either
 * check is removed, the corresponding test in `clients.test.ts` fails.
 */

function requireAdmin(user: SessionUser) {
  if (user.role !== "admin") {
    throw new Error("Only the admin can manage clients.");
  }
}

function nullableText(value?: string): string | null {
  return value && value.length > 0 ? value : null;
}

export async function createClientForUser(user: SessionUser, input: ClientInput) {
  requireAdmin(user);
  const [client] = await db
    .insert(clients)
    .values({
      name: input.name,
      type: input.type,
      phone: nullableText(input.phone),
      email: nullableText(input.email),
      address: nullableText(input.address),
      notes: nullableText(input.notes),
    })
    .returning();
  return client;
}

export async function updateClientForUser(user: SessionUser, input: UpdateClientInput) {
  requireAdmin(user);
  const [client] = await db
    .update(clients)
    .set({
      name: input.name,
      type: input.type,
      phone: nullableText(input.phone),
      email: nullableText(input.email),
      address: nullableText(input.address),
      notes: nullableText(input.notes),
      updatedAt: new Date(),
    })
    .where(eq(clients.id, input.id))
    .returning();
  if (!client) throw new Error("Client not found.");
  return client;
}

export async function archiveClientForUser(user: SessionUser, input: ArchiveClientInput) {
  requireAdmin(user);
  const [client] = await db
    .update(clients)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(clients.id, input.id))
    .returning();
  if (!client) throw new Error("Client not found.");
  return client;
}

/** Default: archived clients hidden. Pass `includeArchived: true` to show them. */
export async function listClients(opts: { includeArchived?: boolean } = {}) {
  if (opts.includeArchived) {
    return db.select().from(clients).orderBy(clients.name);
  }
  return db.select().from(clients).where(isNull(clients.archivedAt)).orderBy(clients.name);
}

export async function getClientById(id: string) {
  const [client] = await db.select().from(clients).where(eq(clients.id, id));
  return client ?? null;
}
