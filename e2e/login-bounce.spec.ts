import { expect, test } from "@playwright/test";

/**
 * Regresi browser-level untuk bug "sesi kayak ke-reset": Chrome suka
 * meng-autocomplete `/login?redirectTo=%2Fdashboard%2Fequipment` dari riwayat,
 * dan sebelum fix ini user yang MASIH ber-sesi sah tetap disuguhi form login —
 * seolah-olah logout, padahal mengetik /dashboard manual langsung masuk.
 *
 * Fix-nya: `app/login/page.tsx` memanggil `getSession()` (lookup DB) dan
 * mem-bounce user ber-sesi ke `loginDestination(role, redirectTo)` — redirectTo
 * dihormati hanya jika berada di area role-nya (lib/login-destination.ts).
 */

test.describe("bounce /login untuk user ber-sesi — staf", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("/login?redirectTo=/dashboard/equipment langsung ke tujuan, bukan form", async ({
    page,
  }) => {
    await page.goto("/login?redirectTo=%2Fdashboard%2Fequipment");
    await expect(page).toHaveURL(/\/dashboard\/equipment/);
  });

  test("/login tanpa redirectTo jatuh ke home role", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});

test.describe("bounce /login untuk user ber-sesi — klien", () => {
  test.use({ storageState: "e2e/.auth/client.json" });

  test("redirectTo lintas area diabaikan — klien mendarat di /portal", async ({ page }) => {
    await page.goto("/login?redirectTo=%2Fdashboard%2Fequipment");
    await expect(page).toHaveURL(/\/portal/);
    await expect(page).not.toHaveURL(/\/dashboard/);
  });
});

test.describe("/login tanpa sesi tetap menampilkan form", () => {
  test("form login masih bisa diakses user anonim", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
  });
});
