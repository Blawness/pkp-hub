import { expect, test as setup } from "@playwright/test";

const PASSWORD = "password123";

const accounts = [
  { role: "admin", email: "admin@pkp.test" },
  { role: "surveyor", email: "bagas@pkp.test" },
  { role: "client", email: "andi@klien.test" },
] as const;

for (const { role, email } of accounts) {
  setup(`login ${role}`, async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Masuk" }).click();
    // Admin/surveyor -> /dashboard, client -> /portal.
    await page.waitForURL(/\/(dashboard|portal)/);
    await expect(page).not.toHaveURL(/\/login$/);
    // Pre-warm rute yang akan disinggahi spec supaya compile Turbopack dingin
    // tidak memicu timeout 30s saat locator pertama kali menunggu.
    if (role === "admin" || role === "surveyor") {
      await page.goto("/dashboard/projects");
    } else {
      await page.goto("/portal/projects");
    }
    await page.context().storageState({ path: `e2e/.auth/${role}.json` });
  });
}
