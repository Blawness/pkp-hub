import { defineConfig, devices } from "@playwright/test";

/**
 * E2E untuk alur pembayaran/kwitansi (Phase 12).
 *
 * Server dev dijalankan otomatis (reuseExistingServer: true — sudah nyala di
 * localhost:3000 saat ini). Database yang dipakai adalah DB sungguhan dari
 * `.env.local`, jadi tiap run menambah baris ke tabel `payment` (append-only,
 * aman). Tes memanggil ulang `pnpm db:seed` tidak dilakukan di sini.
 *
 * `fullyParallel: false` + `workers: 1` karena tes berbagi satu DB dan ada
 * yang memutar status proyek — jalan berurutan supaya tidak saling tabrak.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    actionTimeout: 60_000,
    navigationTimeout: 60_000,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
