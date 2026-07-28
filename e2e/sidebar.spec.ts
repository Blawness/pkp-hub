import { expect, type Page, test } from "@playwright/test";

/**
 * E2E sidebar hover-reveal + pin (spec 2026-07-28).
 *
 * Kenapa E2E dan bukan test komponen: repo ini tidak punya infrastruktur
 * test komponen sama sekali, dan klaim inti spec ini — "panel melebar TANPA
 * menggeser kolom konten" — adalah pernyataan soal layout terpakai yang
 * hanya bisa dibuktikan browser sungguhan.
 *
 * Semua test memakai storageState admin; sidebar tidak bergantung peran
 * (isi tautannya iya, lebarnya tidak).
 */

const RAIL_PX = 72; // 4.5rem
const WIDE_PX = 256; // 16rem

const PANEL = (page: Page) => page.locator('[data-slot="sidebar-panel"]');
const CONTENT = (page: Page) => page.locator('[data-slot="content-column"]');
const PIN_BUTTON = (page: Page) => page.getByRole("button", { name: "Pin sidebar tetap terbuka" });
const UNPIN_BUTTON = (page: Page) => page.getByRole("button", { name: "Lepas pin sidebar" });

/** Lebar terpakai panel, menunggu transisi CSS selesai (auto-retry expect). */
async function expectPanelWidth(page: Page, px: number) {
  await expect(PANEL(page)).toHaveCSS("width", `${px}px`);
}

/** Absis kiri kolom konten — inilah yang TIDAK boleh bergerak saat hover. */
async function contentLeft(page: Page): Promise<number> {
  const box = await CONTENT(page).boundingBox();
  if (!box) throw new Error("kolom konten tidak terlihat");
  return box.x;
}

test.describe("sidebar staf", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("diam sebagai rail ikon tanpa wordmark", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);
    // Wordmark hanya dirender saat melebar, jadi ia penanda keadaan yang
    // lebih jujur daripada lebar semata.
    await expect(PANEL(page).getByText("PKP Hub")).toBeHidden();
  });

  test("pin mengunci lebar dan bertahan setelah reload", async ({ page }) => {
    await page.goto("/dashboard");
    // Hover dulu: setelah Task 3 tombol pin memang hanya muncul saat panel
    // melebar. Di Task 1 hover belum berefek apa-apa dan langkah ini tidak
    // merugikan — ditulis sekarang supaya test tidak perlu diubah nanti.
    await PANEL(page).hover();
    await PIN_BUTTON(page).click();

    await expectPanelWidth(page, WIDE_PX);
    // Saat dipin panel MENDORONG konten — ini beda mendasar dengan hover.
    expect(await contentLeft(page)).toBeCloseTo(WIDE_PX, 0);

    await page.reload();
    await expectPanelWidth(page, WIDE_PX);
    expect(await contentLeft(page)).toBeCloseTo(WIDE_PX, 0);
  });

  test("lepas pin mengembalikan ke rail", async ({ page }) => {
    await page.goto("/dashboard");
    await PANEL(page).hover();
    await PIN_BUTTON(page).click();
    await expectPanelWidth(page, WIDE_PX);

    await UNPIN_BUTTON(page).click();
    // Kursor masih di atas panel sehingga ia tetap terbuka; yang membuktikan
    // pin sudah lepas adalah kolom konten yang balik merapat ke rail.
    await expect
      .poll(async () => contentLeft(page), { message: "konten balik ke tepi rail" })
      .toBeLessThanOrEqual(RAIL_PX + 1);
  });
});
