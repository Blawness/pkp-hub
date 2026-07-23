import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { updateOwnNameSchema } from "@/lib/actions/profile-schemas";
import { updateOwnName, userHasCredential } from "@/lib/actions/users-logic";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, sessions, users } from "@/lib/db/schema";
import { backfillUserRoles, seedSystemRoles } from "@/lib/rbac/system-roles";
import { makeTestContextForUser } from "@/lib/rbac/test-fixtures";
import type { RbacContext } from "@/lib/rbac/types";

// `updateOwnNameAction` (via `rbacActionClient` -> `getRbacContext()`) calls
// `headers()` from `next/headers`, which only works inside a real request
// context. Outside of one it throws. We fake a request context by capturing
// a `Headers` instance carrying a real session cookie (see the "smuggled
// userId" test below) and returning it from a mocked `headers()`.
let mockedRequestHeaders: Headers | undefined;
vi.mock("next/headers", () => ({
  headers: async () => mockedRequestHeaders ?? new Headers(),
}));
// `revalidatePath` also requires a request context outside of which it
// throws; the action's own correctness isn't about caching, so stub it out.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Imported after the mocks above so the action picks up the mocked modules.
const { updateOwnNameAction } = await import("@/lib/actions/profile");

/**
 * Batas keamanan fitur profil ada di SATU tempat: `userId` datang dari sesi
 * (`ctx.user.id`), tidak pernah dari input. Kalau ia bisa datang dari input,
 * siapa pun yang login bisa mengganti nama siapa pun. Test pertama di bawah
 * menjaga persis itu.
 */

const password = "correct-horse-battery-staple";
let meId: string;
let otherId: string;
let meCtx: RbacContext;

beforeAll(async () => {
  meId = randomUUID();
  otherId = randomUUID();
  await db.insert(users).values([
    { id: meId, name: "Saya", email: `me-${meId}@fixture.test`, role: "surveyor" },
    { id: otherId, name: "Orang Lain", email: `other-${otherId}@fixture.test`, role: "surveyor" },
  ]);
  for (const id of [meId, otherId]) {
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(password),
    });
  }

  await seedSystemRoles();
  await backfillUserRoles();
  meCtx = await makeTestContextForUser({
    id: meId,
    name: "Saya",
    email: `me-${meId}@fixture.test`,
    role: "surveyor",
  });
});

afterAll(async () => {
  for (const id of [meId, otherId]) {
    await db.delete(sessions).where(eq(sessions.userId, id));
    await db.delete(accounts).where(eq(accounts.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
  execSync("pnpm db:seed:reset", { stdio: "inherit" });
});

describe("updateOwnNameSchema", () => {
  it("membuang userId yang diselundupkan lewat input", () => {
    const parsed = updateOwnNameSchema.parse({ name: "Nama Baru", userId: otherId });
    expect(parsed).toEqual({ name: "Nama Baru" });
    expect("userId" in parsed).toBe(false);
  });

  it("memangkas spasi dan menolak nama kosong", () => {
    expect(updateOwnNameSchema.parse({ name: "  Budi  " })).toEqual({ name: "Budi" });
    expect(updateOwnNameSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("ganti nama sendiri", () => {
  it("mengubah nama sendiri tanpa menyentuh user lain", async () => {
    await updateOwnName(meCtx, "Nama Saya Yang Baru");

    const [me] = await db.select().from(users).where(eq(users.id, meId));
    const [other] = await db.select().from(users).where(eq(users.id, otherId));

    expect(me.name).toBe("Nama Saya Yang Baru");
    expect(other.name).toBe("Orang Lain");
  });

  it("tidak mengubah role maupun email", async () => {
    await updateOwnName(meCtx, "Nama Lain Lagi");
    const [me] = await db.select().from(users).where(eq(users.id, meId));
    expect(me.role).toBe("surveyor");
    expect(me.email).toBe(`me-${meId}@fixture.test`);
  });
});

describe("updateOwnNameAction (integrasi)", () => {
  it("mengabaikan userId yang diselundupkan di payload dan hanya mengubah nama pemanggil", async () => {
    const meEmail = `me-${meId}@fixture.test`;
    const { headers: signInHeaders } = await auth.api.signInEmail({
      body: { email: meEmail, password },
      returnHeaders: true,
    });

    const setCookie = signInHeaders.get("set-cookie") ?? "";
    const cookieHeader = setCookie
      .split(/,(?=\s*[\w.-]+=)/)
      .map((part) => part.split(";")[0].trim())
      .filter(Boolean)
      .join("; ");
    expect(cookieHeader).toContain("better-auth.session_token=");

    mockedRequestHeaders = new Headers({ cookie: cookieHeader });

    const [otherBefore] = await db.select().from(users).where(eq(users.id, otherId));

    // Selundupkan userId milik ORANG LAIN di payload. Kalau action pernah
    // diubah untuk membaca userId dari input alih-alih ctx.user.id (sesi),
    // ini akan mengubah nama `other`, bukan `me` -- dan assertion di bawah
    // akan gagal.
    const result = await updateOwnNameAction({
      name: "Nama Hasil Serangan",
      // @ts-expect-error -- sengaja mengirim field yang tidak ada di skema
      userId: otherId,
    });

    mockedRequestHeaders = undefined;

    if (result.serverError) {
      throw new Error(`updateOwnNameAction gagal: ${result.serverError}`);
    }
    expect(result.data).toEqual({ success: true });

    const [meAfter] = await db.select().from(users).where(eq(users.id, meId));
    const [otherAfter] = await db.select().from(users).where(eq(users.id, otherId));

    expect(meAfter.name).toBe("Nama Hasil Serangan");
    expect(otherAfter.name).toBe(otherBefore.name);
    expect(otherAfter.name).not.toBe("Nama Hasil Serangan");
  });
});

/** Set-Cookie (bisa berisi banyak cookie) -> satu header `cookie` seperti kiriman browser. */
function cookieHeaderFrom(setCookie: string): string {
  return setCookie
    .split(/,(?=\s*[\w.-]+=)/)
    .map((part) => part.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

async function signIn(email: string, pass: string): Promise<Headers> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: pass },
    returnHeaders: true,
  });
  return new Headers({ cookie: cookieHeaderFrom(headers.get("set-cookie") ?? "") });
}

/** Ambil hash password (tabel `accounts`, providerId "credential") milik `userId`. */
async function credentialHashFor(userId: string): Promise<string | null> {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
  return account?.password ?? null;
}

describe("ganti password sendiri", () => {
  // Aturan "minimal 10 karakter" ada di `passwordSchema` (zod) — tapi itu hanya
  // berjalan di KLIEN. /api/auth/change-password punya aturannya sendiri, dan
  // default Better Auth adalah 8. Tanpa `minPasswordLength: 10` di lib/auth.ts,
  // POST langsung ke endpoint itu bisa menyetel password 8 karakter dan
  // kebijakan kita bocor tanpa suara. Test ini menjaga keduanya tetap sama.
  it("menolak password baru di bawah 10 karakter DI SERVER, bukan cuma di klien", async () => {
    const me = await signIn(`me-${meId}@fixture.test`, password);
    const hashBefore = await credentialHashFor(meId);

    let code: string | undefined;
    try {
      await auth.api.changePassword({
        headers: me,
        body: { currentPassword: password, newPassword: "pendek8x" },
      });
    } catch (error) {
      code = (error as { body?: { code?: string } })?.body?.code;
    }

    expect(code).toBe("PASSWORD_TOO_SHORT");
    expect(await credentialHashFor(meId)).toBe(hashBefore);
  });

  it("menolak password lama yang salah", async () => {
    const me = await signIn(`me-${meId}@fixture.test`, password);
    const hashBefore = await credentialHashFor(meId);
    expect(hashBefore).not.toBeNull();

    // TEMUAN 3: `rejects.toThrow()` polos lulus untuk error APA PUN (sesi
    // tidak valid, body invalid, dsb) — tidak membuktikan bahwa kegagalan
    // ini benar-benar karena password lama yang salah. Better Auth melempar
    // `APIError` dengan `body.code` stabil ("INVALID_PASSWORD", lihat
    // node_modules/.pnpm/@better-auth+core@*/node_modules/@better-auth/core/dist/error/codes.mjs)
    // saat `ctx.context.password.verify` gagal (lib update-user.mjs). Kita
    // cocokkan kode itu langsung, bukan menebak dari pesan yang bisa berubah
    // antar versi.
    let caught: unknown;
    try {
      await auth.api.changePassword({
        headers: me,
        body: { currentPassword: "salah-sekali", newPassword: "password-baru-panjang" },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const apiError = caught as { body?: { code?: string }; status?: unknown };
    // Pastikan ini BUKAN sekadar error sesi/validasi (mis. "UNAUTHORIZED" atau
    // "VALIDATION_ERROR") — melainkan spesifik penolakan password.
    expect(apiError.body?.code).toBe("INVALID_PASSWORD");

    // TEMUAN 2: buktikan percobaan gagal ini benar-benar tidak mengubah apa
    // pun di DB — bandingkan hash sebelum/sesudah, dan buktikan password
    // lama masih bisa dipakai login.
    const hashAfter = await credentialHashFor(meId);
    expect(hashAfter).toBe(hashBefore);

    const stillWorks = await auth.api.signInEmail({
      body: { email: `me-${meId}@fixture.test`, password },
    });
    expect(stillWorks.user.id).toBe(meId);
  });

  it("memutus sesi perangkat lain tapi sesi sendiri tetap hidup", async () => {
    // Dua sesi untuk user yang sama — bayangkan laptop dan HP.
    const laptop = await signIn(`me-${meId}@fixture.test`, password);
    const hp = await signIn(`me-${meId}@fixture.test`, password);

    // TEMUAN 1 (kontrol positif): buktikan KEDUA sesi memang valid SEBELUM
    // changePassword. Tanpa ini, kalau `signIn`/`cookieHeaderFrom` punya bug
    // (mis. parsing set-cookie salah), `hp`/`laptop` bisa saja sudah tidak
    // valid sejak awal -- dan assertion "sesi HP mati" di bawah akan tetap
    // hijau meski `revokeOtherSessions` sebenarnya rusak, karena sesi itu
    // memang sudah null dari awal, bukan karena benar-benar direvoke.
    const laptopBeforeSession = await auth.api.getSession({
      headers: laptop,
      query: { disableCookieCache: true },
    });
    expect(laptopBeforeSession?.user.id).toBe(meId);
    const hpBeforeSession = await auth.api.getSession({
      headers: hp,
      query: { disableCookieCache: true },
    });
    expect(hpBeforeSession?.user.id).toBe(meId);

    const { headers: changed } = await auth.api.changePassword({
      headers: laptop,
      body: {
        currentPassword: password,
        newPassword: "password-baru-yang-panjang",
        revokeOtherSessions: true,
      },
      returnHeaders: true,
    });

    // Sesi "laptop" diganti yang BARU oleh Better Auth — cookie penggantinya
    // ada di response. Inilah cookie yang, kalau hilang (mis. dipanggil dari
    // Server Action tanpa nextCookies), membuat user ke-kick setelah ganti
    // password.
    //
    // BATAS TEST INI, supaya tidak ada yang salah percaya: yang dikunci di sini
    // adalah SEMANTIK `revokeOtherSessions` milik Better Auth (berguna kalau
    // upgrade library mengubahnya diam-diam) — BUKAN tempat kita memanggilnya.
    // Test ini tetap hijau kalau `revokeOtherSessions: true` di
    // components/profile/profile-form.tsx diubah jadi `false`, atau kalau ganti
    // password dipindahkan kembali ke Server Action. Padahal justru di situ
    // bahayanya. Repo ini belum punya infra test komponen (vitest environment:
    // "node", tanpa jsdom/testing-library), jadi jalur klien itu diverifikasi
    // manual di browser — lihat ledger Task 6.
    const laptopBaru = new Headers({
      cookie: cookieHeaderFrom(changed.get("set-cookie") ?? ""),
    });
    const laptopSession = await auth.api.getSession({
      headers: laptopBaru,
      query: { disableCookieCache: true },
    });
    expect(laptopSession?.user.id).toBe(meId);

    // Sesi "HP" harus mati.
    const hpSession = await auth.api.getSession({
      headers: hp,
      query: { disableCookieCache: true },
    });
    expect(hpSession).toBeNull();

    // Kembalikan password fixture supaya test lain tidak terpengaruh urutan.
    await auth.api.changePassword({
      headers: laptopBaru,
      body: { currentPassword: "password-baru-yang-panjang", newPassword: password },
    });
  });
});

describe("userHasCredential", () => {
  it("true untuk user yang punya baris credential", async () => {
    expect(await userHasCredential(meId)).toBe(true);
  });

  it("false untuk user tanpa baris credential", async () => {
    const orphanId = randomUUID();
    await db.insert(users).values({
      id: orphanId,
      name: "Belum Set Password",
      email: `orphan-${orphanId}@fixture.test`,
      role: "client",
    });

    expect(await userHasCredential(orphanId)).toBe(false);

    await db.delete(users).where(eq(users.id, orphanId));
  });

  // Dua test di atas hanya membedakan "punya baris accounts" dari "tidak punya
  // sama sekali" — keduanya tetap hijau kalau filter `providerId` dihapus dari
  // fungsinya (dibuktikan lewat mutasi saat review). Padahal filter itulah satu-
  // satunya yang membuat fungsi ini bukan sekadar "punya baris accounts". Test
  // ini yang menjaganya: hari ini `lib/auth.ts` belum punya socialProviders, jadi
  // baris non-credential tak bisa lahir lewat aplikasi — tapi begitu OAuth
  // ditambahkan, tanpa test ini user OAuth-only akan dianggap punya password dan
  // form ganti password dirender untuk mereka, diam-diam.
  it("false untuk user yang punya baris accounts non-credential", async () => {
    const oauthId = randomUUID();
    await db.insert(users).values({
      id: oauthId,
      name: "OAuth Saja",
      email: `oauth-${oauthId}@fixture.test`,
      role: "client",
    });
    await db.insert(accounts).values({
      id: randomUUID(),
      accountId: oauthId,
      providerId: "google",
      userId: oauthId,
      // tanpa password — persis keadaan user OAuth-only
    });

    expect(await userHasCredential(oauthId)).toBe(false);

    await db.delete(accounts).where(eq(accounts.userId, oauthId));
    await db.delete(users).where(eq(users.id, oauthId));
  });
});
