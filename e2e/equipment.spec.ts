import { expect, test } from "@playwright/test";

/**
 * Inventaris alat — quantity per item (spec 2026-07-16). Alur: admin login →
 * `/dashboard/equipment` → tambah JENIS alat → klik kartu galeri (tampilan
 * default sejak spec 2026-07-22) → tambah UNIT lewat dialog detail → buka
 * proyek → tab Alat → pinjam unit → assert badge kartu berubah jadi "Semua
 * dipinjam" → kembalikan dari halaman detail unit → assert durasi muncul di
 * riwayat.
 *
 * Nama item dan kode unit diberi akhiran `Date.now()` (pola yang sama dengan
 * `project-phases.spec.ts`) supaya spec ini IDEMPOTEN.
 */
const suffix = Date.now();
const itemName = `E2E Total Station ${suffix}`;
const unitCode = `E2E-TS-${suffix}`;
const longItemName = `E2E Logitech G304 Lightspeed Wireless Gaming Mouse ${suffix}`;

test.describe("Inventaris alat — quantity per item (2026-07-16)", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("tambah jenis alat, tambah unit, pinjam di proyek, kembalikan, durasi tampil", async ({
    page,
  }) => {
    // 1. Tambah jenis alat baru lewat dialog di halaman inventaris.
    await page.goto("/dashboard/equipment");
    await page.getByRole("button", { name: "Tambah jenis alat" }).click();

    const itemDialog = page.getByRole("dialog", { name: "Jenis alat baru" });
    await itemDialog.locator("#item-name").fill(itemName);
    await itemDialog.getByRole("button", { name: "Tambah jenis alat" }).click();

    await expect(page.getByText(itemName)).toBeVisible();

    // Kartu item ini di-scope lewat `data-slot="card"` + itemName supaya
    // assertion ringkasan seperti "1 unit · 1 tersedia" tidak nyasar ke
    // kartu jenis alat lain di daftar (banyak item seed lain juga punya
    // ringkasan serupa — teksnya sendiri tidak unik).
    const itemCard = page.locator('[data-slot="card"]').filter({ hasText: itemName });

    // 2. Klik kartu galeri item yang baru dibuat (membuka dialog detail),
    //    lalu tambah unit dengan kode unik dari dalam dialog.
    await page.getByText(itemName).click();
    await page.getByRole("button", { name: "+ Tambah unit" }).click();

    const unitDialog = page.getByRole("dialog", { name: "Unit baru" });
    await unitDialog.locator("#code").fill(unitCode);
    await unitDialog.locator("#serialNumber").fill(`SN-${suffix}`);
    await unitDialog.getByRole("button", { name: "Tambah unit" }).click();

    await expect(page.getByRole("link", { name: unitCode })).toBeVisible();
    // Ringkasan kartu galeri (di belakang dialog) ikut ter-revalidate.
    await expect(itemCard.getByText("1 unit · 1 tersedia")).toBeVisible();

    // 3. Buka proyek, tab Alat, pinjam unit yang baru dibuat. Pemilih alat
    //    adalah Combobox (dialog cari-sendiri), bukan <select> native, dan
    //    labelnya "${itemName} (${unitCode})".
    const equipmentLabel = `${itemName} (${unitCode})`;

    await page.goto("/dashboard/projects");
    await page
      .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
      .first()
      .click();

    await page.getByRole("tab", { name: "Alat" }).click();
    await page.getByRole("button", { name: "Pinjam alat" }).click();

    // Combobox "Alat" defaults ke opsi pertama (bukan placeholder kosong) —
    // itu perilaku yang sengaja dipertahankan (lihat komentar di
    // `borrow-dialog.tsx`), jadi label tombolnya bisa berupa alat lain,
    // bukan selalu "Pilih alat…". Pilih lewat id yang stabil, bukan nama
    // tombol yang bergantung pada urutan alfabet daftar alat.
    await page.locator("#borrow-equipment").click();
    const alatPicker = page.getByRole("dialog", { name: "Pilih alat" });
    await alatPicker.getByPlaceholder("Cari alat…").fill(equipmentLabel);
    await alatPicker.getByRole("button", { name: equipmentLabel }).click();
    await page.getByRole("button", { name: "Pinjam", exact: true }).click();

    // Dialog tertutup, baris muncul di tabel riwayat tab Alat dengan nama
    // pemegang (admin meminjam untuk dirinya sendiri, tidak mengisi "dipakai
    // oleh").
    await expect(page.getByRole("cell", { name: equipmentLabel })).toBeVisible();
    await expect(page.getByText("Sedang dipakai")).toBeVisible();

    // 4. Assert badge kartu galeri berubah jadi "Semua dipinjam" (satu-satunya
    //    unit sedang dipakai), lalu buka dialog detail untuk lanjut ke unit.
    await page.goto("/dashboard/equipment");
    await expect(itemCard.getByText("Semua dipinjam")).toBeVisible();
    await page.getByText(itemName).click();

    // 5. Kembalikan, dari halaman detail unit. Tombol "Kembalikan" membuka
    //    dialog konfirmasi lebih dulu (ada di kartu Status pakai), lalu
    //    dikonfirmasi.
    await page.getByRole("link", { name: unitCode }).click();
    await expect(page.getByText(/Sedang dipakai oleh/)).toBeVisible();
    await page.getByRole("button", { name: "Kembalikan" }).first().click();
    const returnConfirm = page.getByRole("dialog", { name: "Kembalikan alat?" });
    await returnConfirm.getByRole("button", { name: "Kembalikan" }).click();

    // 6. Assert durasi muncul di riwayat, dan unit sudah tidak lagi "Dipakai".
    await expect(page.getByText("Tersedia — tidak sedang dipakai.")).toBeVisible();
    const historyRow = page
      .getByRole("row")
      .filter({ hasText: "Pengukuran batas tanah Cimahi" })
      .last();
    await expect(historyRow.getByText(/menit|jam|hari/)).toBeVisible();
  });

  // Regresi overflow dialog galeri (bug 2026-07-22): judul nowrap (`truncate`)
  // menyumbang min-content penuh ke grid item DialogContent (`min-width: auto`),
  // sehingga track grid melebar melewati lebar dialog dan `overflow-y-auto`
  // memunculkan scrollbar HORIZONTAL. Assert: konten dialog tidak lebih lebar
  // dari dialognya.
  test("dialog galeri tidak overflow horizontal saat nama alat panjang", async ({ page }) => {
    await page.goto("/dashboard/equipment");
    await page.getByRole("button", { name: "Tambah jenis alat" }).click();

    const itemDialog = page.getByRole("dialog", { name: "Jenis alat baru" });
    await itemDialog.locator("#item-name").fill(longItemName);
    await itemDialog.getByRole("button", { name: "Tambah jenis alat" }).click();

    // Tampilan default = galeri; klik kartunya membuka dialog detail.
    await page.getByRole("button", { name: longItemName }).click();
    const detail = page.getByRole("dialog", { name: longItemName });
    await expect(detail).toBeVisible();

    const { clientW, scrollW } = await detail.evaluate((el) => ({
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
    }));
    expect(scrollW).toBeLessThanOrEqual(clientW);
  });
});
