import { describe, expect, it } from "vitest";
import {
  calculateProgress,
  completedAtFor,
  isPhaseLate,
  nextSortOrder,
  resequence,
  todayString,
} from "@/lib/phases/derive";

describe("calculateProgress", () => {
  it("menghitung dari bobot fase yang selesai", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 3 },
        { status: "berjalan", weight: 1 },
        { status: "belum", weight: 1 },
      ]),
    ).toBe(60); // 3 / 5
  });

  it("semua fase selesai -> 100", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 1 },
        { status: "selesai", weight: 4 },
      ]),
    ).toBe(100);
  });

  // Fase 'berjalan' dihitung NOL, bukan setengah. "Setengah selesai" adalah
  // klaim, bukan fakta; kalau pekerjaannya perlu dibelah, belah fasenya.
  it("fase berjalan dihitung nol", () => {
    expect(calculateProgress([{ status: "berjalan", weight: 1 }])).toBe(0);
  });

  // null, BUKAN 0. Nol berarti "sudah punya rencana, belum dikerjakan";
  // null berarti "belum pakai timeline" — UI tidak boleh menampilkan 0%
  // untuk proyek yang cuma belum memakai fitur ini.
  it("proyek tanpa fase -> null", () => {
    expect(calculateProgress([])).toBeNull();
  });

  it("total bobot nol -> null, bukan pembagian nol", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 0 },
        { status: "belum", weight: 0 },
      ]),
    ).toBeNull();
  });

  it("membulatkan ke bilangan bulat", () => {
    expect(
      calculateProgress([
        { status: "selesai", weight: 1 },
        { status: "belum", weight: 1 },
        { status: "belum", weight: 1 },
      ]),
    ).toBe(33);
  });
});

describe("isPhaseLate", () => {
  it("target lewat dan belum selesai -> telat", () => {
    expect(isPhaseLate({ targetDate: "2026-07-01", status: "berjalan" }, "2026-07-14")).toBe(true);
  });

  it("target lewat tapi sudah selesai -> tidak telat", () => {
    expect(isPhaseLate({ targetDate: "2026-07-01", status: "selesai" }, "2026-07-14")).toBe(false);
  });

  it("tanpa target -> tidak pernah telat", () => {
    expect(isPhaseLate({ targetDate: null, status: "belum" }, "2026-07-14")).toBe(false);
  });

  it("target hari ini -> belum telat", () => {
    expect(isPhaseLate({ targetDate: "2026-07-14", status: "belum" }, "2026-07-14")).toBe(false);
  });
});

describe("nextSortOrder", () => {
  it("kosong -> 0", () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it("satu lebih besar dari yang terbesar", () => {
    expect(nextSortOrder([{ sortOrder: 0 }, { sortOrder: 4 }])).toBe(5);
  });
});

describe("resequence", () => {
  it("menghasilkan sortOrder rapat 0..n-1 tanpa kembar", () => {
    expect(resequence(["c", "a", "b"])).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
      { id: "b", sortOrder: 2 },
    ]);
  });
});

describe("todayString", () => {
  // Server berjalan UTC. Jam 06:00 WIB (= 23:00 UTC hari SEBELUMNYA) masih
  // tanggal 14 di Jakarta — kalau kita pakai tanggal UTC, penanda "Telat" akan
  // menyala sehari lebih cepat/lambat dari kenyataan di lapangan.
  it("memakai zona Asia/Jakarta, bukan UTC", () => {
    expect(todayString(new Date("2026-07-13T23:00:00Z"))).toBe("2026-07-14");
  });

  it("format YYYY-MM-DD", () => {
    expect(todayString(new Date("2026-07-14T05:00:00Z"))).toBe("2026-07-14");
  });
});

describe("completedAtFor", () => {
  const now = new Date("2026-07-14T10:00:00Z");

  it("mengisi saat status jadi selesai", () => {
    expect(completedAtFor("selesai", now, null)).toEqual(now);
  });

  it("mempertahankan tanggal selesai lama kalau tetap selesai", () => {
    const before = new Date("2026-07-01T00:00:00Z");
    expect(completedAtFor("selesai", now, before)).toEqual(before);
  });

  // Mundur dari 'selesai' HARUS mengosongkan completedAt — kalau tidak, fase
  // berstatus 'berjalan' tetap membawa tanggal selesai, dan salah satunya bohong.
  it("mengosongkan saat status mundur dari selesai", () => {
    expect(completedAtFor("berjalan", now, new Date("2026-07-01T00:00:00Z"))).toBeNull();
  });
});
