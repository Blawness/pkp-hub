import { describe, expect, it } from "vitest";
import {
  borrowRejection,
  equipmentStockBadge,
  formatDuration,
  summarizeUnits,
  usageDurationMs,
  validateUsageWindow,
} from "@/lib/equipment/derive";

const now = new Date("2026-07-14T12:00:00Z");

describe("usageDurationMs", () => {
  it("sesi tertutup -> selisih mulai dan selesai", () => {
    expect(
      usageDurationMs(
        { startedAt: new Date("2026-07-14T08:00:00Z"), endedAt: new Date("2026-07-14T11:00:00Z") },
        now,
      ),
    ).toBe(3 * 60 * 60 * 1000);
  });

  // Sesi berjalan dihitung sampai `now` yang DI-INJECT — bukan Date.now(),
  // supaya test tidak flaky dan hasilnya bisa ditegaskan persis.
  it("sesi berjalan -> dihitung sampai now", () => {
    expect(
      usageDurationMs({ startedAt: new Date("2026-07-14T09:00:00Z"), endedAt: null }, now),
    ).toBe(3 * 60 * 60 * 1000);
  });
});

describe("formatDuration", () => {
  it("menit saja", () => {
    expect(formatDuration(45 * 60 * 1000)).toBe("45 menit");
  });

  it("jam dan menit", () => {
    expect(formatDuration(3 * 60 * 60 * 1000 + 20 * 60 * 1000)).toBe("3 jam 20 menit");
  });

  it("hari dan jam", () => {
    expect(formatDuration(2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000)).toBe("2 hari 4 jam");
  });
});

describe("borrowRejection", () => {
  const ok = { condition: "tersedia" as const, archivedAt: null };

  it("alat tersedia dan bebas -> boleh", () => {
    expect(borrowRejection(ok, false)).toBeNull();
  });

  it("alat sedang dipakai -> ditolak", () => {
    expect(borrowRejection(ok, true)).toMatch(/sedang dipakai/i);
  });

  // Satu kasus per kondisi: alat yang tidak `tersedia` TIDAK BOLEH dipinjam.
  it("alat dalam perawatan -> ditolak", () => {
    expect(borrowRejection({ condition: "perawatan", archivedAt: null }, false)).toMatch(
      /perawatan/i,
    );
  });

  it("alat rusak -> ditolak", () => {
    expect(borrowRejection({ condition: "rusak", archivedAt: null }, false)).toMatch(/rusak/i);
  });

  it("alat pensiun -> ditolak", () => {
    expect(borrowRejection({ condition: "pensiun", archivedAt: null }, false)).toMatch(/pensiun/i);
  });

  it("alat terarsip -> ditolak", () => {
    expect(borrowRejection({ condition: "tersedia", archivedAt: new Date() }, false)).toMatch(
      /arsip/i,
    );
  });
});

describe("validateUsageWindow", () => {
  it("mulai di masa lalu -> boleh (untuk yang lupa menekan tombol)", () => {
    expect(validateUsageWindow(new Date("2026-07-14T08:00:00Z"), null, now)).toBeNull();
  });

  // Mencatat pemakaian yang BELUM terjadi adalah booking, dan booking bukan
  // cakupan modul ini (spec §Ruang lingkup).
  it("mulai di masa depan -> ditolak", () => {
    expect(validateUsageWindow(new Date("2026-07-15T08:00:00Z"), null, now)).toMatch(/masa depan/i);
  });

  it("selesai sebelum mulai -> ditolak", () => {
    expect(
      validateUsageWindow(new Date("2026-07-14T10:00:00Z"), new Date("2026-07-14T09:00:00Z"), now),
    ).toMatch(/setelah/i);
  });

  it("selesai sama dengan mulai -> ditolak", () => {
    const t = new Date("2026-07-14T10:00:00Z");
    expect(validateUsageWindow(t, t, now)).toMatch(/setelah/i);
  });
});

describe("summarizeUnits", () => {
  it("item tanpa unit -> semua nol", () => {
    expect(summarizeUnits([])).toEqual({
      total: 0,
      tersedia: 0,
      terpinjam: 0,
      perawatan: 0,
      rusak: 0,
    });
  });

  it("menghitung agregat dari campuran kondisi dan sesi aktif", () => {
    const units = [
      { condition: "tersedia" as const, activeUsage: null },
      { condition: "tersedia" as const, activeUsage: { usageId: "u1" } },
      { condition: "perawatan" as const, activeUsage: null },
      { condition: "rusak" as const, activeUsage: null },
      { condition: "pensiun" as const, activeUsage: null },
    ];
    expect(summarizeUnits(units)).toEqual({
      total: 5,
      tersedia: 1,
      terpinjam: 1,
      perawatan: 1,
      rusak: 1,
    });
  });

  // Unit yang sedang dipinjam dihitung "terpinjam" walau condition-nya masih
  // "tersedia" secara fisik — sesi aktif MENIMPA condition, sama seperti
  // kolom Status gabungan di tabel alat sebelumnya.
  it("sesi aktif menimpa condition tersedia", () => {
    const units = [{ condition: "tersedia" as const, activeUsage: { usageId: "u1" } }];
    expect(summarizeUnits(units)).toEqual({
      total: 1,
      tersedia: 0,
      terpinjam: 1,
      perawatan: 0,
      rusak: 0,
    });
  });
});

describe("equipmentStockBadge", () => {
  it("ada unit tersedia -> label jumlah tersedia, variant secondary", () => {
    expect(
      equipmentStockBadge({ total: 3, tersedia: 2, terpinjam: 1, perawatan: 0, rusak: 0 }),
    ).toEqual({ label: "2 tersedia", variant: "secondary" });
  });

  it("tidak ada tersedia tapi ada yang dipinjam -> Semua dipinjam, variant default", () => {
    expect(
      equipmentStockBadge({ total: 2, tersedia: 0, terpinjam: 2, perawatan: 0, rusak: 0 }),
    ).toEqual({ label: "Semua dipinjam", variant: "default" });
  });

  it("tidak ada tersedia & tidak ada yang dipinjam -> Tidak tersedia, variant outline", () => {
    expect(
      equipmentStockBadge({ total: 1, tersedia: 0, terpinjam: 0, perawatan: 1, rusak: 0 }),
    ).toEqual({ label: "Tidak tersedia", variant: "outline" });
  });

  it("tanpa unit sama sekali -> Tidak tersedia", () => {
    expect(
      equipmentStockBadge({ total: 0, tersedia: 0, terpinjam: 0, perawatan: 0, rusak: 0 }),
    ).toEqual({ label: "Tidak tersedia", variant: "outline" });
  });
});
