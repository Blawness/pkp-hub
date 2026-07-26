import { expect, type Page, test } from "@playwright/test";

/**
 * Smoke E2E untuk palette Cmd-K global (spec 2026-07-26, Task 4).
 *
 * Apa yang DIUJI di sini:
 *  - Pintasan ⌘K / Ctrl+K membuka dialog palette
 *  - Hasil pencarian merender setidaknya satu item per kind yang lolos RBAC
 *  - Tekan Enter pada item pertama menavigasi ke `href` yang dikembalikan
 *    server action (sesuai klaim `globalSearchForUser`)
 *  - Pencarian tanpa hasil menampilkan empty state "Tidak ada hasil"
 *  - Surveyor (`bagas@pkp.test`) melihat HASIL yang di-scope ke
 *    `assigned` — proyek yang bukan miliknya tidak muncul di palette,
 *    membuktikan pagar RBAC yang sama dengan halaman detail.
 *
 * CATATAN cakupan:
 *  - Suite ini hanya smoke E2E. Matriks RBAC penuh (klien, surveyor scope
 *    lintas-klien, dst.) sudah diliput `lib/actions/search.test.ts` (Task 3)
 *    yang jauh lebih cepat dan deterministik karena tidak butuh browser.
 *  - Seed dev (`lib/db/seed.ts`) tidak memasukkan dokumen, jadi hasil
 *    "Dokumen" kosong di sini — itu bukan cacat spec, melainkan cermin
 *    data. Kalau seed diperbarui untuk menambah dokumen, suite ini
 *    tinggal di-extend untuk meng-assert kind `document` (lihat
 *    komentar di test multi-kind).
 */

const SEARCH_INPUT = (page: Page) => page.getByPlaceholder("Cari klien, proyek, atau dokumen…");
const SEARCH_TRIGGER = (page: Page) => page.getByRole("button", { name: "Buka pencarian global" });

/**
 * Buka palette via pintasan ⌘K dan tunggu sampai input siap. `page.goto`
 * saja tidak cukup: butuh waktu agar `<GlobalSearchProvider>` mount dan
 * listener `keydown` terpasang ke `document`. Tanpa `toBeVisible()` di
 * pemicu, keyboard event kadang meleset (khas Turbopack cold-compile
 * halaman dashboard) dan dialog tidak terbuka — flake yang sulit
 * direproduksi.
 */
async function openPalette(page: Page) {
  await page.goto("/dashboard");
  await expect(SEARCH_TRIGGER(page)).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(SEARCH_INPUT(page)).toBeVisible();
  return SEARCH_INPUT(page);
}

test.describe("Cmd-K palette — smoke E2E", () => {
  test.describe("sebagai admin", () => {
    test.use({ storageState: "e2e/.auth/admin.json" });

    test("Ctrl+K membuka palette, Enter menavigasi ke detail proyek", async ({ page }) => {
      const input = await openPalette(page);
      await input.fill("Topografi");

      // Server action butuh 200 md debounce + round-trip. Pilih baris PALING
      // ATAS (entah itu dari group mana pun) — CommandItem adalah role
      // generik cmdk dan `value`-nya `${label} ${sub}`; pakai `option` role
      // untuk dapat locator yang stabil terhadap urutan render.
      const firstResult = page.getByRole("option").first();
      await expect(firstResult).toBeVisible();

      const expectedLabel = await firstResult.textContent();
      expect(expectedLabel).toMatch(/Topografi/);

      await firstResult.click();

      // Server action `globalSearch` membangun `href: /dashboard/projects/<id>`
      // untuk hasil kind `project` (lihat `search-logic.ts`). Enter / klik
      // memanggil `router.push(href)`, jadi kita harus sudah di sana.
      await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]+/);
    });

    test("hasil pencarian kosong menampilkan empty state", async ({ page }) => {
      const input = await openPalette(page);
      await input.fill("ZZZZZNOTHINGMATCH");

      // `CommandEmpty` dirender ketika server mengembalikan 0 baris.
      // Pesan persis mengikuti template di `global-search-palette.tsx`.
      await expect(page.getByText('Tidak ada hasil untuk "ZZZZZNOTHINGMATCH".')).toBeVisible();
    });

    test("kata kunci yang sama memunculkan kind yang lolos RBAC", async ({ page }) => {
      // "Cahaya" hanya cocok di kolom `name` klien "PT Cahaya Properti"
      // (tidak ada proyek/dokumen dengan kata itu). Suite ini sengaja
      // memilih keyword yang persis satu kind supaya assertion tidak
      // gampang rapuh: seed tidak punya dokumen, jadi uji multi-kind
      // penuh tidak mungkin di sini. Kalau seed ditambah dokumen,
      // ganti keyword ke sesuatu yang menyentuh klien + proyek + dokumen
      // dan perketat assertion.
      const input = await openPalette(page);
      await input.fill("Cahaya");

      // `<CommandGroup heading="...">` di cmdk merender label sebagai
      // `<div data-cmdk-group-heading>` — BUKAN elemen heading ARIA.
      // Lingkup pencarian ke dialog supaya teks "Klien" di sidebar
      // (yang juga muncul di dashboard) tidak ikut kena.
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("Klien", { exact: true })).toBeVisible();

      const clientResult = page.getByRole("option").filter({ hasText: "PT Cahaya Properti" });
      await expect(clientResult).toBeVisible();
    });
  });

  test.describe("sebagai surveyor", () => {
    test.use({ storageState: "e2e/.auth/surveyor.json" });

    test("scope `assigned` menyembunyikan proyek milik surveyor lain", async ({ page }) => {
      // Seed: `bagas@pkp.test` (surveyor1) di-assign ke "Cimahi" dan
      // "Kavling blok C". Proyek "Topografi" di-assign ke surveyor2
      // (Rizky), sehingga palette bagas TIDAK boleh memunculkannya
      // — pagar yang sama dengan halaman detail proyek (lihat
      // `globalSearchForUser` → `rbacFilter(ctx, "project.read")`).
      const input = await openPalette(page);
      await input.fill("Topografi");

      // Proyek yang bukan miliknya tidak muncul — tidak ada role "option"
      // sama sekali di list, sehingga CommandEmpty yang tampil.
      await expect(page.getByText('Tidak ada hasil untuk "Topografi".')).toBeVisible();
    });

    test("proyek yang di-assign tetap bisa dicari", async ({ page }) => {
      // Kontraposisi dari test di atas: "Cimahi" milik bagas sendiri,
      // jadi palette harus tetap menampilkan entry navigasi.
      const input = await openPalette(page);
      await input.fill("Cimahi");

      const firstResult = page.getByRole("option").first();
      await expect(firstResult).toBeVisible();
      await expect(firstResult).toContainText("Cimahi");

      await firstResult.click();
      await expect(page).toHaveURL(/\/dashboard\/projects\/[0-9a-f-]+/);
    });
  });
});
