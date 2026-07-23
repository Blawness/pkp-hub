import { describe, expect, it } from "vitest";
import { buildCrumbs } from "@/components/dashboard/nav-config";

// Admin memegang seluruh katalog — predikat izin selalu true.
const admin = () => true;

describe("buildCrumbs", () => {
  it("hanya Dashboard di root", () => {
    expect(buildCrumbs([], admin)).toEqual([
      { key: "/dashboard", label: "Dashboard", href: "/dashboard" },
    ]);
  });

  it("halaman seksi jadi remah terakhir tanpa tautan", () => {
    expect(buildCrumbs(["equipment"], admin)).toEqual([
      { key: "/dashboard", label: "Dashboard", href: "/dashboard" },
      { key: "/dashboard/equipment", label: "Inventaris", href: undefined },
    ]);
  });

  it("segmen id dipetakan ke Detail dan menautkan balik ke seksinya", () => {
    expect(buildCrumbs(["projects", "5f2c1a3e"], admin)).toEqual([
      { key: "/dashboard", label: "Dashboard", href: "/dashboard" },
      { key: "/dashboard/projects", label: "Proyek", href: "/dashboard/projects" },
      { key: "/dashboard/projects/5f2c1a3e", label: "Detail", href: undefined },
    ]);
  });

  // Regresi: /dashboard/equipment/unit tidak punya page.tsx — ia cuma menamai
  // ruang route anaknya. Menampilkannya sebagai remah menghasilkan "Detail ›
  // Detail" sekaligus tautan yang mendarat di 404.
  it("melewati segmen yang tidak punya halaman sendiri", () => {
    expect(buildCrumbs(["equipment", "unit", "1cf11325"], admin)).toEqual([
      { key: "/dashboard", label: "Dashboard", href: "/dashboard" },
      { key: "/dashboard/equipment", label: "Inventaris", href: "/dashboard/equipment" },
      { key: "/dashboard/equipment/unit/1cf11325", label: "Detail", href: undefined },
    ]);
  });

  it("segmen aksi memakai labelnya sendiri", () => {
    expect(buildCrumbs(["projects", "new"], admin).at(-1)).toEqual({
      key: "/dashboard/projects/new",
      label: "Baru",
      href: undefined,
    });
  });

  it("profile punya label sendiri meski bukan item sidebar", () => {
    expect(buildCrumbs(["profile"], admin).at(-1)?.label).toBe("Profil Saya");
  });
});
