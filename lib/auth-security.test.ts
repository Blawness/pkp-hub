import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, sessions, users } from "@/lib/db/schema";

/**
 * Regression coverage for the Phase 2 review findings:
 *
 *  - CRITICAL 1: public self-signup must be rejected (`disableSignUp` on
 *    `lib/auth.ts`'s `emailAndPassword` config).
 *  - CRITICAL 2: the server-side guard (`lib/auth-guards.ts#getSession`) must
 *    be DB-backed, not trust the 5-minute cookie cache — a session whose row
 *    was deleted must be rejected immediately, not up to 5 minutes later.
 */

const email = `security-test-${randomUUID()}@fixture.test`;
const password = "correct-horse-battery-staple";
let userId: string;

beforeAll(async () => {
  userId = randomUUID();
  await db.insert(users).values({ id: userId, name: "Security Test User", email, role: "owner" });
  await db.insert(accounts).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(password),
  });
});

afterAll(async () => {
  // FK-safe teardown of just this fixture's rows.
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(accounts).where(eq(accounts.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("public self-signup (CRITICAL 1)", () => {
  it("rejects an unauthenticated sign-up instead of minting an account", async () => {
    const signUpEmail = randomUUID();
    await expect(
      auth.api.signUpEmail({
        body: {
          name: "Uninvited Attacker",
          email: `${signUpEmail}@fixture.test`,
          password: "whatever-password-123",
        },
      }),
    ).rejects.toThrow();

    const [created] = await db
      .select()
      .from(users)
      .where(eq(users.email, `${signUpEmail}@fixture.test`));
    expect(created).toBeUndefined();
  });
});

describe("DB-backed session guard (CRITICAL 2)", () => {
  it("rejects a session whose row was deleted from the DB, even with a cookie cache", async () => {
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });

    const setCookie = signInHeaders.get("set-cookie") ?? "";
    // Pull every `name=value` pair out of the (possibly multi-cookie)
    // Set-Cookie header so the request below carries both the session token
    // and the cookie cache — exactly what a browser would send.
    const cookieHeader = setCookie
      .split(/,(?=\s*[\w.-]+=)/)
      .map((part) => part.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    expect(cookieHeader).toContain("better-auth.session_token=");

    const requestHeaders = new Headers({ cookie: cookieHeader });

    // Sanity check: the session is valid before we touch the DB.
    const beforeDelete = await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
    expect(beforeDelete?.user.email).toBe(email);

    // Delete the session row directly, simulating revocation/expiry that the
    // signed cookie cache would otherwise mask for up to 5 minutes.
    await db.delete(sessions).where(eq(sessions.userId, userId));

    const afterDelete = await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
    expect(afterDelete).toBeNull();
  });
});
