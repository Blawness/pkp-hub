import { expect, test } from "@playwright/test";

/**
 * E2E untuk PWA bootstrap (manifest + service worker + meta tag).
 *
 * Tidak butuh storage state — semua pengujian di level HTTP & head HTML,
 * bukan interaksi user. Beda dari spec kebanyakan yang butuh login.
 *
 * Yang diuji:
 *  - /manifest.webmanifest 200 dengan Content-Type manifest+json dan field
 *    wajib ada (name, start_url, icons 192+512, display standalone).
 *  - /sw.js 200 dengan Content-Type javascript dan Cache-Control no-cache
 *    (supaya update SW selalu sampai ke user).
 *  - HTML root memuat <link rel="manifest"> dan <link rel="apple-touch-icon">
 *    dengan ukuran yang benar.
 *  - <meta name="theme-color"> muncul untuk light & dark.
 *  - Halaman root (/) tidak error saat load — sebagai smoke test bahwa
 *    komponen InstallPrompt me-mount tanpa crash.
 */

test.describe("PWA manifest", () => {
  test("dilayani dengan Content-Type yang benar dan field wajib ada", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/manifest+json");

    const body = await res.json();
    expect(body.name).toBe("PKP Hub");
    expect(body.short_name).toBe("PKP Hub");
    expect(body.start_url).toBe("/");
    expect(body.scope).toBe("/");
    expect(body.display).toBe("standalone");
    expect(body.theme_color).toBe("#1b6fd8");
    // Setidaknya ada ikon 192 dan 512 (syarat minimum Chrome).
    const sizes = (body.icons as Array<{ sizes: string }>).map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  test("ikon PWA ada di /public dan bisa di-fetch", async ({ request }) => {
    for (const path of ["/icon-192.png", "/icon-512.png", "/maskable-icon-512.png"]) {
      const res = await request.get(path);
      expect(res.status(), `icon ${path} harus ada`).toBe(200);
    }
  });
});

test.describe("PWA service worker", () => {
  test("/sw.js dilayani dengan Content-Type JS dan no-cache", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/javascript");
    // Service worker harus selalu di-fetch fresh; kalau cache, user bisa
    // terjebak di SW lama setelah deploy.
    const cacheControl = res.headers()["cache-control"];
    expect(cacheControl).toContain("no-cache");
    expect(cacheControl).toContain("no-store");
  });

  test("SW body punya listener install tapi TANPA fetch (supaya App Router tidak putus)", async ({
    request,
  }) => {
    const res = await request.get("/sw.js");
    const body = await res.text();
    expect(body).toMatch(/addEventListener\(['"]install['"]/);
    // Fetch handler sengaja TIDAK dipasang — `event.respondWith(fetch(req))`
    // dapat memutuskan RSC payload/streaming milik Next App Router sehingga
    // link/button tidak responsif setelah install. Cukup cek tidak ada
    // listener fetch aktif; `clients.claim()` ada di comment sebagai
    // peringatan dan tidak dijalankan.
    expect(body).not.toMatch(/addEventListener\(['"]fetch['"]/);
  });
});

test.describe("PWA HTML meta tag", () => {
  test("root memuat link manifest, apple-touch-icon, dan theme-color", async ({ page }) => {
    await page.goto("/");
    const html = await page.content();
    // Manifest link otomatis di-inject oleh Next dari `app/manifest.ts`,
    // atau via `metadata.manifest` — keduanya menghasilkan tag ini.
    expect(html).toMatch(/<link[^>]+rel=["']manifest["']/);
    expect(html).toMatch(/<link[^>]+rel=["']apple-touch-icon["']/);
    // theme-color untuk light & dark (lihat `viewport` export di layout).
    expect(html).toMatch(/<meta[^>]+name=["']theme-color["'][^>]+content=["']#1b6fd8["']/);
    expect(html).toMatch(/<meta[^>]+name=["']theme-color["'][^>]+content=["']#0a0d14["']/);
  });

  test("halaman root me-mount tanpa error (smoke test InstallPrompt)", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    // Tunggu sebentar agar React selesai hydrate + effect RegisterSW jalan.
    await page.waitForLoadState("networkidle");
    expect(errors, "tidak boleh ada JS error saat mount").toEqual([]);
    // InstallPrompt tidak merender tombol bila `beforeinstallprompt` belum
    // fire (kondisi default di headless Chromium), dan render null saat
    // SSR — jadi tombol TIDAK boleh ada di test env.
    await expect(page.getByRole("button", { name: "Install Aplikasi" })).toHaveCount(0);
  });
});
