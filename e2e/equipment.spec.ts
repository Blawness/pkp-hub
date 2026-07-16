import { expect, test } from "@playwright/test";

/**
 * Inventaris alat — quantity per item (spec 2026-07-16). Alur: admin login →
 * `/dashboard/equipment` → tambah JENIS alat → expand item → tambah UNIT →
 * buka proyek → tab Alat → pinjam unit → assert badge item berubah jadi "1
 * dipinjam" → kembalikan dari halaman detail unit → assert durasi muncul di
 * riwayat.
 *
 * Nama item dan kode unit diberi akhiran `Date.now()` (pola yang sama dengan
 * `project-phases.spec.ts`) supaya spec ini IDEMPOTEN.
 */
const suffix = Date.now();
const itemName = `E2E Total Station ${suffix}`;
const unitCode = `E2E-TS-${suffix}`;

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
    // assertion ringkasan seperti "1 total"/"1 dipinjam" tidak nyasar ke
    // kartu jenis alat lain di daftar (banyak item seed lain juga punya
    // ringkasan "1 total" dst. — teksnya sendiri tidak unik).
    const itemCard = page.locator('[data-slot="card"]').filter({ hasText: itemName });

    // 2. Expand item yang baru dibuat, tambah unit dengan kode unik.
    await page.getByText(itemName).click();
    await page.getByRole("button", { name: "+ Tambah unit" }).click();

    const unitDialog = page.getByRole("dialog", { name: "Unit baru" });
    await unitDialog.locator("#code").fill(unitCode);
    await unitDialog.locator("#serialNumber").fill(`SN-${suffix}`);
    await unitDialog.getByRole("button", { name: "Tambah unit" }).click();

    await expect(page.getByRole("link", { name: unitCode })).toBeVisible();
    await expect(itemCard.getByText("1 total")).toBeVisible();

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

    // 4. Assert badge item di daftar inventaris berubah jadi "1 dipinjam".
    await page.goto("/dashboard/equipment");
    await page.getByText(itemName).click();
    await expect(itemCard.getByText("1 dipinjam")).toBeVisible();

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
});
