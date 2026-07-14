import { expect, test } from "@playwright/test";

test.describe("Ledger pembayaran & kwitansi (Phase 12)", () => {
  test.describe("sebagai admin", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("mencatat pembayaran → kwitansi ber-nomor muncul di panel", async ({ page }) => {
      await page.goto("/dashboard/projects");
      await page
        .getByRole("link", { name: /Topografi lahan perumahan tahap 2/ })
        .first()
        .click();

      await page.getByRole("tab", { name: "Keuangan" }).click();
      await page.getByRole("button", { name: "Catat pembayaran" }).click();

      await page.locator("#amount").fill("1000000");
      await page.locator("#paidAt").fill("2026-07-14");
      await page.getByRole("button", { name: "Simpan" }).click();

      // Baris baru dengan nominal persis ini harus muncul di ledger.
      // (formatIDR: "Rp 1.000.000"; pakai .first() karena tiap run menambah baris.)
      await expect(page.getByText("Rp 1.000.000").first()).toBeVisible();
      // Nomor kwitansi otomatis terbit (format KW/PKP/YYYY/NNNN).
      await expect(page.getByText("KW/PKP/").first()).toBeVisible();
    });
  });

  test.describe("sebagai surveyor", () => {
    test.use({ storageState: "e2e/.auth/surveyor.json" });

    test("tidak melihat tab Keuangan di proyek yang di-assign", async ({ page }) => {
      await page.goto("/dashboard/projects");
      await page
        .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
        .first()
        .click();

      await expect(
        page.getByRole("heading", { name: /Pengukuran batas tanah Cimahi/ }),
      ).toBeVisible();
      // Guard UI: tab Keuangan sama sekali tidak dirender untuk surveyor.
      await expect(page.getByRole("tab", { name: "Keuangan" })).toHaveCount(0);
    });
  });

  test.describe("sebagai klien", () => {
    test.use({ storageState: "e2e/.auth/client.json" });

    test("melihat riwayat pembayaran + kwitansi di portal", async ({ page }) => {
      await page.goto("/portal");
      await page
        .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
        .first()
        .click();

      await expect(page.getByText("Nilai & pembayaran")).toBeVisible();
      // Kwitansi milik sendiri tampil (nomor demo dari seed).
      await expect(page.getByText("KW/PKP/2026/0001")).toBeVisible();
      await expect(page.getByText("Lunas")).toBeVisible();
    });
  });
});
