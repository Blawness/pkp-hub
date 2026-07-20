import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, sessions, users } from "@/lib/db/schema";

// `getSession` di auth-guards memanggil `headers()` dari `next/headers`, yang
// hanya hidup di dalam request context sungguhan. Di luar itu ia melempar,
// jadi kita palsukan dengan `Headers` yang membawa cookie sesi nyata (pola
// yang sama dengan `lib/actions/profile.test.ts`).
let mockedRequestHeaders: Headers | undefined;
vi.mock("next/headers", () => ({
  headers: async () => mockedRequestHeaders ?? new Headers(),
}));

// Diimpor SETELAH mock di atas supaya guard memakai `headers()` tiruan.
const { getSession } = await import("@/lib/auth-guards");

/**
 * Regression coverage for the Phase 2 review findings:
 *
 *  - CRITICAL 1: public self-signup must be rejected (`disableSignUp` on
 *    `lib/auth.ts`'s `emailAndPassword` config).
 *  - CRITICAL 2: the server-side guard (`lib/auth-guards.ts#getSession`) must
 *    be DB-backed, not trust the 5-minute cookie cache — a session whose row
 *    was deleted must be rejected immediately, not up to 5 minutes later.
 *  - CRITICAL 3 (bug "Ingat saya tidak berfungsi"): setiap user ke-logout
 *    paksa persis 7 hari setelah login karena cookie `session_token` tidak
 *    PERNAH diterbitkan ulang — refresh sesi di RSC membuang `Set-Cookie`.
 *    Fix-nya dua sisi: (a) plugin `nextCookies()` + `SessionHeartbeat` yang
 *    memanggil `/api/auth/get-session` dari browser, dan (b) guard membaca
 *    sesi dengan `disableRefresh` supaya render RSC tidak "memakan" jendela
 *    refresh yang seharusnya dipakai heartbeat. Tes di bawah mengunci bahwa
 *    get-session memperpanjang sesi hampir-kedaluwarsa di DB DAN menerbitkan
 *    ulang cookienya, sementara guard tidak menyentuh expiresAt sama sekali.
 */

const email = `security-test-${randomUUID()}@fixture.test`;
const password = "correct-horse-battery-staple";
let userId: string;

beforeAll(async () => {
  userId = randomUUID();
  await db.insert(users).values({ id: userId, name: "Security Test User", email, role: "admin" });
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

describe("sliding session expiry / remember-me (CRITICAL 3)", () => {
  it("get-session extends a near-expiry session in the DB AND reissues the cookie with full maxAge", async () => {
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });

    // Ambil HANYA pasangan session_token — tanpa `session_data`, supaya
    // permintaan lewat jalur DB (persis kondisi di produksi begitu cache
    // 5 menit kedaluwarsa), bukan jalur pintas cookie cache.
    const tokenPair = (signInHeaders.get("set-cookie") ?? "")
      .split(/,(?=\s*[\w.-]+=)/)
      .map((part) => part.split(";")[0].trim())
      .find((pair) => pair.startsWith("better-auth.session_token="));
    expect(tokenPair).toBeDefined();

    // Mundurkan expiresAt ke dalam jendela `updateAge` (24 jam): sesi yang
    // tinggal 1 jam lagi HARUS di-refresh oleh get-session berikutnya.
    const nearExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(sessions).set({ expiresAt: nearExpiry }).where(eq(sessions.userId, userId));

    const { headers: refreshHeaders } = await auth.api.getSession({
      headers: new Headers({ cookie: tokenPair as string }),
      returnHeaders: true,
    });

    // 1) Baris sesi di DB diperpanjang kembali ke ~7 hari.
    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);

    // 2) Cookie baru diterbitkan dengan maxAge penuh. Inilah header yang di
    //    produksi dibawa response `/api/auth/get-session` ke browser lewat
    //    `SessionHeartbeat` — tanpanya cookie browser mati di hari ke-7
    //    walau sesi DB-nya hidup terus (bug aslinya).
    const refreshed = refreshHeaders?.get("set-cookie") ?? "";
    expect(refreshed).toContain("better-auth.session_token=");
    expect(refreshed).toMatch(/Max-Age=604800/);
  });

  it("registers the next-cookies plugin so Server Action auth calls can forward Set-Cookie", () => {
    const plugins =
      (auth as unknown as { options?: { plugins?: ReadonlyArray<{ id: string }> } }).options
        ?.plugins ?? [];
    expect(plugins.some((plugin) => plugin.id === "next-cookies")).toBe(true);
  });
});

describe("RSC guard tidak boleh me-refresh sesi (CRITICAL 3, sisi lain)", () => {
  it("getSession guard membaca sesi hampir-kedaluwarsa TANPA memanjangkannya", async () => {
    // Bersihkan sesi sisa tes sebelumnya supaya hitungan baris pasti.
    await db.delete(sessions).where(eq(sessions.userId, userId));
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    const tokenPair = (signInHeaders.get("set-cookie") ?? "")
      .split(/,(?=\s*[\w.-]+=)/)
      .map((part) => part.split(";")[0].trim())
      .find((pair) => pair.startsWith("better-auth.session_token="));
    expect(tokenPair).toBeDefined();

    const nearExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await db.update(sessions).set({ expiresAt: nearExpiry }).where(eq(sessions.userId, userId));

    // Guard dipanggil persis seperti saat render RSC: headers request
    // membawa cookie sesi, lewat `headers()` yang di-mock.
    mockedRequestHeaders = new Headers({ cookie: tokenPair as string });
    const session = await getSession();
    expect(session?.user.email).toBe(email);

    // Sesi HARUS tetap ~1 jam. Kalau guard ikut me-refresh (tanpa
    // `disableRefresh`), expiresAt melompat ke ~7 hari dan jendela updateAge
    // "dimakan" oleh render yang tidak bisa mengirim cookie — heartbeat yang
    // datang kemudian tidak menerbitkan apa pun dan user tetap ke-logout di
    // hari ke-7. Itulah bug yang dikunci tes ini.
    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].expiresAt.getTime()).toBeLessThan(Date.now() + 2 * 60 * 60 * 1000);
  });
});
