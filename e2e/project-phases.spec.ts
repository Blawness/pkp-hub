import { expect, test } from "@playwright/test";

/**
 * Timeline fase proyek (Phase 13, spec 2026-07-14). Alur: admin login → buka
 * proyek → tab Fase → tambah 3 fase → tandai 1 selesai → logout → login
 * sebagai klien → buka proyek → progres & nama fase terlihat, catatan
 * internal TIDAK ada di halaman (pemangkasan field query, bukan render).
 *
 * Nama fase diberi akhiran `Date.now()` (sama seperti pola email di
 * `client-portal.spec.ts`) supaya assert berbasis TEKS tidak bentrok kalau
 * spec ini dijalankan berkali-kali terhadap DB dev yang sama (append-only,
 * seperti `payments.spec.ts`). Persen progres TIDAK di-assert dengan angka
 * pasti untuk alasan yang sama: proyek ini bisa sudah punya fase dari run
 * sebelumnya.
 */
const suffix = Date.now();
const phaseNames = {
  survei: `E2E Survei awal ${suffix}`,
  olah: `E2E Pengolahan data ${suffix}`,
  serah: `E2E Serah terima ${suffix}`,
};
const internalNote = `E2E-RAHASIA-INTERNAL-${suffix}`;

test.describe("Timeline fase proyek (Phase 13)", () => {
  test.describe("sebagai admin", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("tambah fase, tandai selesai, progres tampil", async ({ page }) => {
      await page.goto("/dashboard/projects");
      await page
        .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
        .first()
        .click();

      await page.getByRole("tab", { name: "Fase" }).click();

      // Fase 1 — dengan catatan internal, untuk dites TIDAK bocor ke portal.
      await page
        .getByRole("button", { name: /Tambah fase/ })
        .first()
        .click();
      await page.locator("#phase-name").fill(phaseNames.survei);
      await page.locator("#phase-description").fill(internalNote);
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByText(phaseNames.survei)).toBeVisible();

      // Fase 2
      await page.getByRole("button", { name: "Tambah fase" }).click();
      await page.locator("#phase-name").fill(phaseNames.olah);
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByText(phaseNames.olah)).toBeVisible();

      // Fase 3
      await page.getByRole("button", { name: "Tambah fase" }).click();
      await page.locator("#phase-name").fill(phaseNames.serah);
      await page.getByRole("button", { name: "Simpan" }).click();
      await expect(page.getByText(phaseNames.serah)).toBeVisible();

      // Tandai fase 1 selesai lewat dropdown status di kartunya (identifikasi
      // via aria-label spesifik-per-fase yang dipasang `phase-card.tsx`).
      await page.getByRole("combobox", { name: `Status fase ${phaseNames.survei}` }).click();
      await page.getByRole("option", { name: "Selesai" }).click();

      // Progres persen terlihat (bukan angka pasti — proyek ini bisa sudah
      // punya fase dari run sebelumnya, lihat komentar di atas berkas ini).
      await expect(page.getByText(/\d+ dari \d+ fase selesai · \d+%/)).toBeVisible();
    });
  });

  test.describe("sebagai klien", () => {
    test.use({ storageState: "e2e/.auth/client.json" });

    test("melihat timeline read-only, tanpa catatan internal", async ({ page }) => {
      await page.goto("/portal");
      await page
        .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
        .first()
        .click();

      await expect(page.getByText("Timeline fase")).toBeVisible();
      await expect(page.getByText(phaseNames.survei)).toBeVisible();
      await expect(page.getByText(/fase selesai/)).toBeVisible();

      // Tidak ada tombol kelola apa pun untuk klien.
      await expect(page.getByRole("button", { name: /Tambah fase/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Ubah" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Hapus" })).toHaveCount(0);

      // Catatan internal (di-set admin lewat #phase-description) tidak boleh
      // muncul di HTML sama sekali — pemangkasan terjadi di level query.
      await expect(page.getByText(internalNote)).toHaveCount(0);
      const html = await page.content();
      expect(html).not.toContain(internalNote);
    });
  });
});
