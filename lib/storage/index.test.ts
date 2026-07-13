import { describe, expect, it } from "vitest";
import { hasR2Config, type R2Config, selectStorageDriverName } from "@/lib/storage";

/**
 * Pemilihan driver adalah satu-satunya hal yang berdiri antara dokumen yang
 * tersimpan dan dokumen yang hilang: kalau `local` yang terpilih di produksi,
 * file ditulis ke disk ephemeral Vercel dan lenyap tanpa suara.
 *
 * `config` disuntikkan, tidak dibaca dari env ambient. Versi sebelumnya
 * membaca `env` langsung dan hanya menegaskan satu kasus ("R2 absen -> local"),
 * jadi ia lulus semata-mata karena `.env.local` kebetulan belum punya
 * kredensial R2 — begitu kredensial itu ada, test-nya justru menguji hal lain
 * tanpa ada yang memberitahu.
 */

const FULL: R2Config = {
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
};

describe("pemilihan driver storage", () => {
  it("memilih r2 saat keempat var R2 ada", () => {
    expect(selectStorageDriverName(FULL)).toBe("r2");
    expect(hasR2Config(FULL)).toBe(true);
  });

  it("jatuh ke local saat tidak ada satu pun var R2", () => {
    expect(selectStorageDriverName({})).toBe("local");
  });

  // Inilah kasus yang menggigit di produksi: konfigurasi yang HAMPIR lengkap.
  // Satu var hilang harus jatuh ke local — dan lebih penting lagi, harus
  // terlihat, bukan diam-diam dianggap r2 lalu gagal saat upload.
  for (const missing of Object.keys(FULL) as (keyof R2Config)[]) {
    it(`jatuh ke local saat ${missing} hilang`, () => {
      const partial = { ...FULL, [missing]: undefined };
      expect(selectStorageDriverName(partial)).toBe("local");
    });

    it(`jatuh ke local saat ${missing} berisi string kosong`, () => {
      const empty = { ...FULL, [missing]: "" };
      expect(selectStorageDriverName(empty)).toBe("local");
    });
  }
});
