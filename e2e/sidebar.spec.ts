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
    // `.poll`, bukan sekali baca: transisi lebar `<aside>` berjalan setelah
    // klik, jadi kolom konten butuh waktu sebelum benar-benar berhenti di 256px.
    await expect.poll(async () => contentLeft(page)).toBeCloseTo(WIDE_PX, 0);

    await page.reload();
    await expectPanelWidth(page, WIDE_PX);
    await expect.poll(async () => contentLeft(page)).toBeCloseTo(WIDE_PX, 0);
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

test.describe("sidebar melebar saat hover", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("hover melebarkan panel TANPA menggeser konten", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);
    const before = await contentLeft(page);

    await PANEL(page).hover();

    await expectPanelWidth(page, WIDE_PX);
    await expect(PANEL(page).getByText("PKP Hub")).toBeVisible();
    // Klaim inti spec: panel menimpa, bukan mendorong.
    expect(await contentLeft(page)).toBeCloseTo(before, 0);
  });

  test("kursor pergi mengembalikan ke rail", async ({ page }) => {
    await page.goto("/dashboard");
    await PANEL(page).hover();
    await expectPanelWidth(page, WIDE_PX);

    // Geser kursor jauh ke kanan, keluar dari panel.
    await page.mouse.move(900, 400);
    await expectPanelWidth(page, RAIL_PX);
  });

  test("fokus keyboard membuka panel", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);

    // Tab dari awal dokumen sampai fokus mendarat di dalam panel. Tanpa jalur
    // fokus, pengguna keyboard akan mendarat di tautan yang labelnya
    // tersembunyi — itu sebabnya test ini ada.
    await page.locator("body").press("Tab");
    for (let i = 0; i < 8; i++) {
      if (await PANEL(page).evaluate((el) => el.contains(document.activeElement))) break;
      await page.keyboard.press("Tab");
    }

    await expect
      .poll(async () => PANEL(page).evaluate((el) => el.contains(document.activeElement)))
      .toBe(true);
    await expectPanelWidth(page, WIDE_PX);
  });
});

test.describe("sidebar rail tetap terbaca", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("tautan ikon punya nama aksesibel saat rail", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);

    // Labelnya tidak tergambar saat rail, tapi nama aksesibelnya HARUS ada —
    // sejak tooltip dimatikan, `aria-label` satu-satunya yang tersisa untuk
    // pembaca layar.
    await expect(PANEL(page).getByRole("link", { name: "Proyek" })).toBeAttached();
    // `toHaveCount(0)`, bukan `toBeHidden()`: label teksnya memang TIDAK
    // dirender saat rail, dan `toBeHidden()` lolos begitu saja untuk elemen yang
    // tidak ada — assertion yang selalu hijau apa pun yang terjadi.
    await expect(PANEL(page).getByText("Proyek")).toHaveCount(0);
  });

  test("tombol pin tak bisa diklik di rail, muncul saat melebar", async ({ page }) => {
    await page.goto("/dashboard");
    await expectPanelWidth(page, RAIL_PX);
    // Tombolnya TETAP terpasang di DOM supaya tetap bisa dicapai Tab (kalau
    // dilepas, pengguna keyboard yang menab maju tidak pernah sampai padanya),
    // tapi di rail sempit ia harus tak terlihat DAN tak bisa ditekan — di sana
    // ia berdesakan dengan ikon nav dan gampang tertekan tak sengaja.
    await expect(PIN_BUTTON(page)).toBeAttached();
    await expect(PIN_BUTTON(page)).toHaveCSS("opacity", "0");
    await expect(PIN_BUTTON(page)).toHaveCSS("pointer-events", "none");

    await PANEL(page).hover();
    await expect(PIN_BUTTON(page)).toBeVisible();
    await expect(PIN_BUTTON(page)).toHaveCSS("opacity", "1");
    await expect(PIN_BUTTON(page)).toHaveCSS("pointer-events", "auto");
  });
});

test.describe("sidebar di perangkat tanpa hover", () => {
  /**
   * Chromium headless default selalu melaporkan `(hover: hover)`, jadi cabang
   * `!hoverCapable` di `sidebar.tsx` tidak pernah sekali pun dieksekusi tanpa
   * emulasi. Padahal cabang itulah satu-satunya jalan keluar dari rail bagi
   * pengguna tablet.
   *
   * `hasTouch`, BUKAN `Emulation.setEmulatedMedia` lewat CDP: fitur media
   * `hover`/`pointer` diam-diam diabaikan oleh Chromium yang dipakai repo ini
   * (sudah diukur — `matchMedia("(hover: hover)")` tetap `true`), sementara
   * `hasTouch` benar-benar membalik keduanya menjadi `hover: none` +
   * `pointer: coarse`. Viewport sengaja dibiarkan selebar desktop: sidebar ini
   * `hidden md:block`, jadi preset perangkat mobile justru melenyapkan yang
   * mau dites. Opsi konteks berlaku sebelum `goto` — penting, karena
   * `matchMedia` hanya dibaca sekali saat mount.
   */
  test.use({ storageState: "e2e/.auth/admin.json", hasTouch: true });

  test("tombol pin selalu terlihat dan hover tidak melebarkan", async ({ page }) => {
    await page.goto("/dashboard");

    await expectPanelWidth(page, RAIL_PX);
    // Kebalikan dari desktop: di sini tombol pin justru wajib terlihat penuh
    // dan bisa ditekan sejak di rail.
    await expect(PIN_BUTTON(page)).toBeVisible();
    await expect(PIN_BUTTON(page)).toHaveCSS("opacity", "1");
    await expect(PIN_BUTTON(page)).toHaveCSS("pointer-events", "auto");

    // Hover TIDAK boleh membuka panel — di layar sentuh `pointerenter` tetap
    // menyala saat tap, dan panel yang ikut melebar akan nyangkut terbuka.
    await PANEL(page).hover();
    await expectPanelWidth(page, RAIL_PX);

    // Pin tetap jalan sebagai jalan keluar dari rail.
    await PIN_BUTTON(page).click();
    await expectPanelWidth(page, WIDE_PX);
    await expect.poll(async () => contentLeft(page)).toBeCloseTo(WIDE_PX, 0);
    await expect(UNPIN_BUTTON(page)).toBeVisible();
  });
});

test.describe("sidebar menimpa konten pihak ketiga", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  /**
   * Regresi #1: Leaflet memasang z-index tinggi sendiri (`.leaflet-pane` 400,
   * `.leaflet-control` 800, `.leaflet-top` 1000). Tanpa `isolate` di
   * `content-column` (lihat `app/dashboard/layout.tsx`) angka-angka itu
   * bertanding di konteks tumpukan akar dan mengubur panel `z-40` — petak peta
   * dan toolbar gambar tergambar DI ATAS panel yang melebar, dan klik di sana
   * mengenai peta, bukan tautan nav.
   */
  test("panel melebar berada di atas peta Leaflet", async ({ page }) => {
    await page.goto("/dashboard/projects");
    await page
      .getByRole("link", { name: /Pengukuran batas tanah Cimahi/ })
      .first()
      .click();
    await page.getByRole("tab", { name: "Peta" }).click();
    // Tunggu Leaflet benar-benar terpasang — sebelum itu tidak ada z-index
    // saingan sama sekali dan test ini akan hijau palsu.
    await expect(page.locator(".leaflet-container")).toBeVisible();

    await PANEL(page).hover();
    await expectPanelWidth(page, WIDE_PX);

    // Titik uji dihitung dari IRISAN panel dengan TOOLBAR gambar
    // (`.leaflet-top`, z-index 1000), bukan ditebak dari koordinat tautan nav.
    // Toolbar-lah sasaran yang tepat: ia elemen ber-z-tinggi yang pasti ada
    // tanpa bergantung petak tile yang butuh jaringan, dan letaknya di pojok
    // kiri-atas peta — persis wilayah yang direbut panel saat melebar.
    const overlap = await page.evaluate(() => {
      const panel = document.querySelector('[data-slot="sidebar-panel"]')?.getBoundingClientRect();
      const map = document.querySelector(".leaflet-top")?.getBoundingClientRect();
      if (!panel || !map) return null;
      const x1 = Math.max(panel.left, map.left);
      const x2 = Math.min(panel.right, map.right);
      const y1 = Math.max(panel.top, map.top);
      const y2 = Math.min(panel.bottom, map.bottom);
      if (x2 <= x1 || y2 <= y1) return null;
      const px = (x1 + x2) / 2;
      const py = (y1 + y2) / 2;
      const el = document.elementFromPoint(px, py);
      return {
        px,
        insidePanel: !!el?.closest('[data-slot="sidebar-panel"]'),
        insideMap: !!el?.closest(".leaflet-container"),
      };
    });
    if (!overlap)
      throw new Error("panel dan toolbar peta tidak beririsan — test kehilangan objeknya");

    // Irisan memang di wilayah yang cuma ada saat panel melebar.
    expect(overlap.px).toBeGreaterThan(RAIL_PX);
    // Yang menerima klik di sana harus panel, bukan peta.
    expect(overlap.insideMap).toBe(false);
    expect(overlap.insidePanel).toBe(true);
  });
});
