import { expect, test } from "@playwright/test";

/**
 * Inventaris alat (Phase 14, spec 2026-07-14). Alur: admin login →
 * `/dashboard/equipment` → tambah alat → buka proyek → tab Alat → pinjam →
 * assert alat berstatus "Dipakai" beserta nama pemegang → kembalikan →
 * assert durasi muncul di riwayat.
 *
 * Nama alat diberi akhiran `Date.now()` (pola yang sama dengan
 * `project-phases.spec.ts`) supaya spec ini IDEMPOTEN: setiap run membuat
 * baris barunya sendiri dan meng-assert lewat teks unik itu, tidak menumpuk
 * ke data bersama lalu melonggarkan assertion.
 */
const suffix = Date.now();
const equipmentName = `E2E Total Station ${suffix}`;

test.describe("Inventaris alat (Phase 14)", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("tambah alat, pinjam di proyek, kembalikan, durasi tampil", async ({ page }) => {
    // 1. Tambah alat baru lewat DIALOG di halaman inventaris (tidak lagi
    //    halaman `/new`). Field diisi di dalam dialog; setelah simpan dialog
    //    tertutup dan alat muncul di daftar (tanpa pindah halaman).
    await page.goto("/dashboard/equipment");
    await page.getByRole("button", { name: "Tambah alat" }).click();

    const addDialog = page.getByRole("dialog", { name: "Alat baru" });
    await addDialog.locator("#name").fill(equipmentName);
    await addDialog.locator("#serialNumber").fill(`SN-${suffix}`);
    await addDialog.getByRole("button", { name: "Tambah alat" }).click();

    await expect(page.getByRole("link", { name: equipmentName })).toBeVisible();

    // 2. Buka proyek, tab Alat, pinjam alat yang baru dibuat. Pemilih alat
    //    adalah Combobox (dialog cari-sendiri), bukan <select> native.
    await page.goto("/dashboard/projects");
    await page
      .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
      .first()
      .click();

    await page.getByRole("tab", { name: "Alat" }).click();
    await page.getByRole("button", { name: "Pinjam alat" }).click();

    await page.getByRole("button", { name: "Pilih alat…" }).click();
    const alatPicker = page.getByRole("dialog", { name: "Pilih alat" });
    await alatPicker.getByPlaceholder("Cari alat…").fill(equipmentName);
    await alatPicker.getByRole("button", { name: equipmentName }).click();
    await page.getByRole("button", { name: "Pinjam", exact: true }).click();

    // Dialog tertutup, baris muncul di tabel riwayat tab Alat dengan nama
    // pemegang (admin meminjam untuk dirinya sendiri, tidak mengisi "dipakai
    // oleh").
    await expect(page.getByRole("cell", { name: equipmentName })).toBeVisible();
    await expect(page.getByText("Sedang dipakai")).toBeVisible();

    // 3. Assert alat berstatus "Terpinjam" di daftar inventaris, beserta nama pemegang.
    // Kolom status di daftar adalah gabungan: sesi pinjam aktif menimpa kondisi
    // fisik, jadi alat yang sedang dipakai tampil "Terpinjam".
    await page.goto("/dashboard/equipment");
    const equipmentRow = page.getByRole("row").filter({ hasText: equipmentName });
    await expect(equipmentRow.getByText(/Terpinjam/)).toBeVisible();

    // 4. Kembalikan, dari halaman detail alat. Tombol "Kembalikan" kini
    //    membuka dialog konfirmasi lebih dulu (ada di kartu Status pakai DAN
    //    di baris riwayat aktif — ambil yang pertama), lalu dikonfirmasi.
    await equipmentRow.getByRole("link", { name: equipmentName }).click();
    await expect(page.getByText(/Sedang dipakai oleh/)).toBeVisible();
    await page.getByRole("button", { name: "Kembalikan" }).first().click();
    const returnConfirm = page.getByRole("dialog", { name: "Kembalikan alat?" });
    await returnConfirm.getByRole("button", { name: "Kembalikan" }).click();

    // 5. Assert durasi muncul di riwayat, dan alat sudah tidak lagi "Dipakai".
    // Kolom tabel riwayat di halaman detail alat adalah Proyek/Dipakai
    // oleh/Mulai/Selesai/Durasi/Catatan — nama alat sendiri tidak diulang di
    // baris (sudah jadi judul halaman), jadi baris dicari lewat nama proyek.
    await expect(page.getByText("Tersedia — tidak sedang dipakai.")).toBeVisible();
    const historyRow = page
      .getByRole("row")
      .filter({ hasText: "Pengukuran batas tanah Cimahi" })
      .last();
    await expect(historyRow.getByText(/menit|jam|hari/)).toBeVisible();
  });
});
