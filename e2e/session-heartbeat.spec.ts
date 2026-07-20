import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

/**
 * Regresi browser-level untuk bug "Ingat saya tidak berfungsi" (CRITICAL 3,
 * lihat `lib/auth-security.test.ts`): cookie `session_token` dulu punya umur
 * TETAP 7 hari dan tidak pernah diterbitkan ulang, jadi setiap user ke-logout
 * paksa di hari ke-7 walau masih aktif.
 *
 * Fix-nya: `SessionHeartbeat` (components/auth/session-heartbeat.tsx) memanggil
 * `/api/auth/get-session` dari browser setiap layout ter-mount, dan response-nya
 * membawa `Set-Cookie` baru (nextCookies() di lib/auth.ts). Tes ini membuktikannya
 * dari ujung paling luar: cookie browser yang SUDAH DIPENDEKKAN benar-benar
 * dipanjangkan kembali ~7 hari hanya dengan membuka halaman.
 */

const ADMIN_EMAIL = "admin@pkp.test";
const ONE_HOUR_S = 60 * 60;
const SIX_DAYS_S = 6 * 24 * 60 * 60;

async function getSessionTokenCookie(context: import("@playwright/test").BrowserContext) {
  const cookies = await context.cookies();
  // Tanpa prefix `__Secure-` di dev (HTTP); pakai suffix supaya kebal lingkungan.
  return cookies.find((cookie) => cookie.name.endsWith("session_token"));
}

test.describe("SessionHeartbeat — dashboard (admin)", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("membuka /dashboard memperpanjang sesi yang hampir kedaluwarsa (DB + cookie browser)", async ({
    page,
    context,
  }) => {
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ADMIN_EMAIL));
    if (!admin) throw new Error(`user seed ${ADMIN_EMAIL} tidak ada — jalankan db:seed`);

    // Simulasikan user yang hampir 7 hari tidak membuka app: sesi di DB tinggal
    // 1 jam, dan cookie di browser dipendekkan ke umur yang sama (nilai cookie
    // TIDAK diubah — hanya expires-nya, persis keadaan cookie yang menua).
    const nearExpiry = new Date(Date.now() + ONE_HOUR_S * 1000);
    await db.update(sessions).set({ expiresAt: nearExpiry }).where(eq(sessions.userId, admin.id));

    const token = await getSessionTokenCookie(context);
    if (!token) throw new Error("cookie session_token tidak ada di storage state");
    await context.addCookies([{ ...token, expires: Math.floor(Date.now() / 1000) + ONE_HOUR_S }]);
    expect((await getSessionTokenCookie(context))?.expires).toBeLessThan(
      Date.now() / 1000 + 2 * ONE_HOUR_S,
    );

    // Buang cookie cache `session_data`: setup baru saja login, jadi di browser
    // ini ia masih segar (< 5 menit). Dengan setup DB, better-auth mematikan
    // `cookieRefreshCache`, dan cache yang masih segar membuat get-session
    // dijawab dari cache TANPA `Set-Cookie` apa pun. Di produksi cache itu
    // cuma hidup 5 menit — user yang kembali di hari ke-6/7 pasti sudah tidak
    // memilikinya, jadi jalur DB-lah yang memperpanjang token. Hapus di sini
    // supaya tes mereplikasi skenario nyata tersebut.
    const cacheCookie = (await context.cookies()).find((cookie) =>
      cookie.name.endsWith("session_data"),
    );
    if (cacheCookie) {
      await context.clearCookies({ name: cacheCookie.name });
    }

    // Buka dashboard: heartbeat harus menembak GET /api/auth/get-session.
    const getSession = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/get-session") && response.request().method() === "GET",
    );
    await page.goto("/dashboard");
    await expect(page).not.toHaveURL(/\/login/);
    const heartbeatResponse = await getSession;
    expect(heartbeatResponse.status()).toBe(200);
    // Bukti di lapisan HTTP: response heartbeat membawa token yang
    // diterbitkan ulang dengan umur penuh, sebelum dicek di cookie jar.
    // `allHeaders()`, bukan `headers()` — yang terakhir membuang set-cookie.
    const heartbeatHeaders = await heartbeatResponse.allHeaders();
    expect(heartbeatHeaders["set-cookie"] ?? "").toContain("Max-Age=604800");

    // Cookie browser diterbitkan ulang menjadi ~7 hari. Sebelum fix, cookie
    // tetap 1 jam dan user ke-logout begitu lewat — inilah asersi inti bug.
    await expect
      .poll(async () => (await getSessionTokenCookie(context))?.expires ?? 0, {
        timeout: 10_000,
      })
      .toBeGreaterThan(Date.now() / 1000 + SIX_DAYS_S);

    // Sesi di DB ikut dipanjangkan kembali (sliding expiry konsisten).
    // Hanya baris yang dipakai browser yang diperiksa — sisa-sisa login run
    // sebelumnya tidak relevan (heartbeat cuma menyentuh sesi milik cookie).
    // Token mentah = nilai cookie bertanda tangan sampai titik pertama.
    const browserToken = decodeURIComponent(token.value).split(".")[0];
    const [row] = await db.select().from(sessions).where(eq(sessions.token, browserToken));
    if (!row) throw new Error("baris sesi milik browser tidak ditemukan di DB");
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + SIX_DAYS_S * 1000);
  });
});

test.describe("SessionHeartbeat — portal (klien)", () => {
  test.use({ storageState: "e2e/.auth/client.json" });

  test("membuka /portal juga menembakkan heartbeat get-session", async ({ page }) => {
    const getSession = page.waitForResponse(
      (response) =>
        response.url().includes("/api/auth/get-session") && response.request().method() === "GET",
    );
    await page.goto("/portal");
    await expect(page).not.toHaveURL(/\/login/);
    const heartbeatResponse = await getSession;
    expect(heartbeatResponse.status()).toBe(200);
  });
});
