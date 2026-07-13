import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

/**
 * Regresi untuk bug produksi "login-nya masih hidup tapi /dashboard melempar
 * balik ke /login setelah beberapa menit".
 *
 * Akarnya: `proxy.ts` dulu memutuskan sudah-login-atau-belum HANYA dari cookie
 * cache (`better-auth.session_data`), yang umurnya `session.cookieCache.maxAge`
 * = 5 menit dan TIDAK PERNAH diperbarui — satu-satunya penulisnya adalah
 * response dari `/api/auth/*`, sementara aplikasi ini tidak pernah memanggil
 * `useSession` di klien dan `nextCookies()` tidak terpasang. Lewat 5 menit
 * cookie itu hilang dari browser, `getCookieCache` mengembalikan null, dan
 * proxy menendang user yang `better-auth.session_token`-nya (7 hari) masih sah.
 *
 * Karena itu tes di bawah memakai nama cookie non-`__Secure-`: `isProduction`
 * di better-auth bernilai false saat NODE_ENV=test, jadi itulah nama yang
 * dibaca `getSessionCookie`/`getCookieCache` di sini.
 */

const SECRET = process.env.BETTER_AUTH_SECRET;
if (!SECRET) throw new Error("BETTER_AUTH_SECRET wajib ada — jalankan lewat `npm test`.");

const SESSION_TOKEN_COOKIE = "better-auth.session_token";
const SESSION_DATA_COOKIE = "better-auth.session_data";

/**
 * Bangun nilai cookie cache persis seperti `setCookieCache` better-auth
 * (strategi "compact"): base64url dari JSON berisi payload + `expiresAt` +
 * HMAC-SHA256 base64url-tanpa-padding atas keduanya.
 */
function cookieCacheValue(role: string, expiresInMs: number): string {
  const sessionData = {
    session: {
      id: "sess-fixture",
      token: "token-fixture",
      userId: "user-fixture",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    user: { id: "user-fixture", name: "Fixture", email: "fixture@test.local", role },
    updatedAt: Date.now(),
    version: "1",
  };
  const expiresAt = Date.now() + expiresInMs;
  const signature = createHmac("sha256", SECRET as string)
    .update(JSON.stringify({ ...sessionData, expiresAt }))
    .digest("base64url");

  return Buffer.from(JSON.stringify({ session: sessionData, expiresAt, signature })).toString(
    "base64url",
  );
}

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, "https://pkp-hub.vercel.app"));
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

/** Lokasi redirect, atau null kalau proxy meneruskan request. */
async function redirectOf(req: NextRequest): Promise<string | null> {
  const res = await proxy(req);
  const location = res.headers.get("location");
  return location ? new URL(location).pathname : null;
}

describe("proxy: sesi hidup dengan cookie cache basi", () => {
  it("MENERUSKAN /dashboard saat session_token ada tapi cookie cache sudah kedaluwarsa", async () => {
    // Inilah bug produksinya: setelah 5 menit browser membuang session_data,
    // jadi yang tersisa hanya session_token — dan itu SUDAH CUKUP untuk lewat.
    const res = await proxy(request("/dashboard", { [SESSION_TOKEN_COOKIE]: "token-fixture" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("MENERUSKAN /dashboard saat cookie cache ada tapi expiresAt-nya sudah lewat", async () => {
    const req = request("/dashboard", {
      [SESSION_TOKEN_COOKIE]: "token-fixture",
      [SESSION_DATA_COOKIE]: cookieCacheValue("admin", -60_000),
    });
    expect(await redirectOf(req)).toBeNull();
  });
});

describe("proxy: gerbang belum-login", () => {
  it("melempar ke /login saat tidak ada cookie sama sekali", async () => {
    expect(await redirectOf(request("/dashboard"))).toBe("/login");
  });

  it("melempar ke /login saat HANYA cookie cache yang ada (tanpa session_token)", async () => {
    // session_token adalah satu-satunya bukti login yang sah. Cookie cache
    // tanpa itu berarti user sudah logout / token dicabut.
    const req = request("/dashboard", { [SESSION_DATA_COOKIE]: cookieCacheValue("admin", 60_000) });
    expect(await redirectOf(req)).toBe("/login");
  });

  it("menyimpan path asal di ?redirectTo", async () => {
    const res = await proxy(request("/dashboard/projects"));
    const location = new URL(res.headers.get("location") as string);
    expect(location.searchParams.get("redirectTo")).toBe("/dashboard/projects");
  });

  it("tidak menyentuh rute di luar /dashboard dan /portal", async () => {
    expect(await redirectOf(request("/login"))).toBeNull();
  });
});

describe("proxy: pembelokan salah-area (hanya saat cookie cache masih segar)", () => {
  it("membelokkan klien dari /dashboard ke /portal", async () => {
    const req = request("/dashboard", {
      [SESSION_TOKEN_COOKIE]: "token-fixture",
      [SESSION_DATA_COOKIE]: cookieCacheValue("client", 60_000),
    });
    expect(await redirectOf(req)).toBe("/portal");
  });

  it("membelokkan staf dari /portal ke /dashboard", async () => {
    const req = request("/portal", {
      [SESSION_TOKEN_COOKIE]: "token-fixture",
      [SESSION_DATA_COOKIE]: cookieCacheValue("surveyor", 60_000),
    });
    expect(await redirectOf(req)).toBe("/dashboard");
  });

  it("meneruskan staf ke /dashboard", async () => {
    const req = request("/dashboard", {
      [SESSION_TOKEN_COOKIE]: "token-fixture",
      [SESSION_DATA_COOKIE]: cookieCacheValue("admin", 60_000),
    });
    expect(await redirectOf(req)).toBeNull();
  });
});
