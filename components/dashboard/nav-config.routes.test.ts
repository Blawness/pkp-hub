import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCrumbs, PATHLESS_PATHS } from "@/components/dashboard/nav-config";

/**
 * Penjaga struktural breadcrumb.
 *
 * `buildCrumbs` menurunkan href dari struktur URL, jadi ia diam-diam
 * mengasumsikan tiap segmen perantara punya halaman. Asumsi itu pernah salah:
 * `/dashboard/equipment/unit` cuma menamai ruang route anaknya, dan remahnya
 * jadi tautan yang mendarat di 404. Menambah route namespace baru akan
 * mengulang bug yang sama tanpa satu pun error — jadi alih-alih menunggu ada
 * yang mengklik, tes ini memindai `app/dashboard` sendiri dan menuntut setiap
 * remah yang bisa diklik menunjuk ke `page.tsx` yang benar-benar ada.
 */

const DASHBOARD_DIR = path.resolve(__dirname, "../../app/dashboard");

/** Segmen route tiap halaman nyata, relatif terhadap /dashboard. */
function findRoutes(dir = DASHBOARD_DIR, segments: string[] = []): string[][] {
  const routes: string[][] = [];
  if (existsSync(path.join(dir, "page.tsx"))) routes.push(segments);

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    routes.push(...findRoutes(path.join(dir, entry.name), [...segments, entry.name]));
  }
  return routes;
}

const ROUTES = findRoutes();

/** Segmen dinamis cocok dengan nilai apa pun; sisanya harus sama persis. */
function hasPage(href: string): boolean {
  const wanted = href
    .replace(/^\/dashboard\/?/, "")
    .split("/")
    .filter(Boolean);
  return ROUTES.some(
    (route) =>
      route.length === wanted.length &&
      route.every((seg, i) => seg.startsWith("[") || seg === wanted[i]),
  );
}

describe("breadcrumb vs route nyata", () => {
  it("menemukan route dashboard", () => {
    // Kalau perpindahan file bikin pemindaian mandul, tes di bawah akan lulus
    // secara hampa — jadi buktikan dulu ia benar-benar melihat sesuatu.
    expect(ROUTES.length).toBeGreaterThan(5);
  });

  it.each(
    ROUTES.map((r) => [`/dashboard/${r.join("/")}`, r] as const),
  )("%s: semua remah yang bisa diklik menuju halaman yang ada", (_label, route) => {
    // Id asli tidak penting di sini; yang diuji adalah bentuk path-nya.
    const segments = route.map((seg) => (seg.startsWith("[") ? "sample-id" : seg));
    const clickable = buildCrumbs(segments, { role: "admin" }).filter((c) => c.href);

    for (const crumb of clickable) {
      expect(hasPage(crumb.href as string), `remah "${crumb.label}" → ${crumb.href}`).toBe(true);
    }
  });

  it("PATHLESS_PATHS tidak menyimpan entri basi", () => {
    // Entri yang halamannya kemudian dibuat akan menyembunyikan remah yang
    // sebenarnya sah — sama tidak kelihatannya dengan bug aslinya.
    for (const pathless of PATHLESS_PATHS) {
      expect(hasPage(pathless), `${pathless} sekarang punya page.tsx`).toBe(false);
    }
  });
});
