import { expect, test } from "@playwright/test";

const CLIENT_PASSWORD = "rahasia-klien-123";
// Email unik per run supaya tidak bentrok dengan data seed/run sebelumnya.
let createdClientEmail = "";

test.describe("Akses portal klien", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test.describe("pembuatan manual (Settings → Users)", () => {
    test("admin membuat akun klien, lalu klien bisa login ke /portal", async ({ page }) => {
      createdClientEmail = `klien-manual-${Date.now()}@pkp.test`;

      await page.goto("/dashboard/settings/users");
      await page.getByRole("button", { name: "Tambah klien" }).click();
      await page.locator("#name").fill("Klien Manual E2E");
      await page.locator("#email").fill(createdClientEmail);
      await page.locator("#password").fill(CLIENT_PASSWORD);
      await page.getByRole("button", { name: "Buat akun" }).click();

      // Dialog tertutup; baris user klien muncul di tabel.
      await expect(page.getByText(createdClientEmail)).toBeVisible();
    });

    test("klien hasil pembuatan manual benar-benar bisa masuk", async ({ page, context }) => {
      // Pakai context bersih (logout admin) lalu login sebagai klien.
      await context.clearCookies();
      await page.goto("/login");
      await page.locator("#email").fill(createdClientEmail);
      await page.locator("#password").fill(CLIENT_PASSWORD);
      await page.getByRole("button", { name: "Masuk" }).click();

      await expect(page).toHaveURL(/\/portal/);
    });
  });

  test.describe("undangan (halaman Klien)", () => {
    test("admin mengundang klien → akun portal langsung tercipta (tertaut)", async ({ page }) => {
      const email = `klien-undang-${Date.now()}@pkp.test`;

      // Buat klien lewat dialog di halaman Klien (belum punya akun portal).
      const clientName = "Klien Undang E2E";
      await page.goto("/dashboard/clients");
      await page.getByRole("button", { name: "Klien baru" }).click();
      await page.locator("#name").fill(clientName);
      await page.locator("#email").fill(email);
      await page.getByRole("button", { name: "Buat klien" }).click();

      // Dialog tertutup; buka detail klien yang baru dibuat dari daftar.
      await expect(page.getByRole("dialog")).toBeHidden();
      await page.getByRole("link", { name: clientName }).click();

      // Berada di halaman detail; tombol undangan tersedia.
      await expect(page.getByRole("button", { name: "Undang ke portal" })).toBeVisible();

      const inviteBtn = page.getByRole("button", { name: "Undang ke portal" });
      await expect(inviteBtn).toBeEnabled();
      await inviteBtn.click();

      // Setelah undangan, akun portal langsung tercipta & tertaut ke klien:
      // server me-render ulang (hasUser=true) dan tombol berubah menjadi
      // teks statis "Sudah punya akun portal".
      await expect(page.getByText("Sudah punya akun portal")).toBeVisible({ timeout: 15000 });
    });
  });
});
