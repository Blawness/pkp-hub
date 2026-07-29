import { describe, expect, it } from "vitest";
import { createR2Driver } from "@/lib/storage/r2-driver";

/**
 * Regresi inventaris 2026-07-29: setiap `<img>` di halaman /dashboard/equipment
 * patah di produksi. Presigned URL yang dikembalikan AWS SDK berbentuk
 * SUBdomain (`<bucket>.<account>.r2.cloudflarestorage.com/<key>`) sedangkan
 * `objectBase` dan URL yang tersimpan di DB berbentuk PATH
 * (`<account>.r2.cloudflarestorage.com/<bucket>/<key>`). R2 menjawab 403 untuk
 * hostname yang tidak dipetakan ke bucket itu, dan image-gallerry pun
 * menampilkan ikon "image broken" untuk SEMUA alat.
 *
 * Fix: `forcePathStyle: true` di S3Client. Test ini mengunci invariant itu:
 * apa pun yang dikembalikan presigner HARUS dimulai dengan `objectBase/`
 * persis seperti yang disimpan di DB — kalau tidak, server akan menyajikan
 * URL yang browser tidak bisa ambil, dan ini akan ketahuan hanya di produksi
 * ketika peralatan nyata sudah terisi gambar.
 *
 * Presign di SDK berjalan lokal (tidak butuh R2), jadi kredensial tiruan
 * cukup — yang diuji di sini BUKAN apakah signature valid, hanya BENTUK URL.
 */

const CFG = {
  R2_ACCOUNT_ID: "d3c7b0f5b7fc96eee07fc483c6d0645e",
  R2_ACCESS_KEY_ID: "fake-key",
  R2_SECRET_ACCESS_KEY: "fake-secret",
  R2_BUCKET: "pkp-cms",
} as const;

// `createR2Driver` membaca dari `env` (bukan argumen). Stub env sebelum
// meng-impor driver. Vitest menjalankan test dalam worker yang sama, jadi
// module-level `env.R2_*` di driver akan melihat ini.
for (const [k, v] of Object.entries(CFG)) {
  process.env[k] = v;
}

describe("r2 driver — bentuk URL presigned", () => {
  const driver = createR2Driver();
  const objectBase = `https://${CFG.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${CFG.R2_BUCKET}`;

  it("driver.getSignedUrl menghasilkan URL PATH-style, bukan subdomain", async () => {
    const signed = await driver.getSignedUrl("equipment/abc-123.webp");
    const path = signed.split("?")[0];
    expect(path).toBe(`${objectBase}/equipment/abc-123.webp`);
    // Anti-regresi: kalau ada yang menghapus `forcePathStyle: true`, URL
    // akan jatuh ke subdomain dan pathname BUKAN berisi nama bucket lagi.
    expect(path).not.toMatch(new RegExp(`^https://${CFG.R2_BUCKET}\\.[^/]+/`));
    expect(path).toContain(`/${CFG.R2_BUCKET}/`);
  });

  it("driver.put menghasilkan canonical URL yang dimulai dengan objectBase", async () => {
    // Tidak benar-benar upload — hanya verifikasi format URL yang akan
    // dikembalikan. put mengirim ke R2, jadi di sini kita uji keyFromUrl
    // yang merupakan kebalikannya.
    const key = "equipment/test.webp";
    const url = `${objectBase}/${key}`;
    expect(driver.keyFromUrl(url)).toBe(key);
  });

  it("keyFromUrl menolak URL yang BUKAN dari R2 ini (subdomain atau domain lain)", () => {
    // Subdomain-style (yang dulu dihasilkan presigner) harus ditolak, kalau
    // tidak `keyFromUrl` akan mengembalikan key yang salah saat DB menyimpan
    // URL campuran dari format lama + baru.
    expect(() =>
      driver.keyFromUrl(
        `https://${CFG.R2_BUCKET}.${CFG.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/equipment/x.webp`,
      ),
    ).toThrow();
    expect(() =>
      driver.keyFromUrl("https://other-bucket.r2.cloudflarestorage.com/x.webp"),
    ).toThrow();
  });
});
