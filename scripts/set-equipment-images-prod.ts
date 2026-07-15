/**
 * Sekali-pakai: set gambar untuk alat yang belum punya foto.
 *
 * Alur (mengikuti flow upload gambar alat di app):
 *  1. Download foto produk dari sumber (CDN retailer — sudah disajikan WebP).
 *  2. Upload ke storage (`equipment/<uuid>.webp`) → dapat fileUrl.
 *  3. Set `equipment.image = fileUrl`.
 *
 * AMAN: hanya menyentuh alat yang `image`-nya masih kosong (skip yang sudah
 * punya, kecuali `--force`). DRY-RUN default (download jalan, tapi TIDAK upload
 * / tidak UPDATE); tulis dengan `--commit`.
 *
 *   tsx --env-file=.env.prod scripts/set-equipment-images-prod.ts            # dry-run
 *   tsx --env-file=.env.prod scripts/set-equipment-images-prod.ts --commit   # tulis
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";
import { storage } from "@/lib/storage";

/** name alat → URL foto produk (Newegg CDN, hotlink-friendly, menyajikan WebP). */
const SOURCES: Record<string, string> = {
  "LAPTOP MSI THIN 15 B12U": "https://c1.neweggimages.com/productimage/nb1280/34-156-659-17.jpg",
  "LAPTOP MSI MODERN 14": "https://c1.neweggimages.com/productimage/nb1280/34-156-443-01.jpg",
  "LAPTOP LENOVO LOQ": "https://c1.neweggimages.com/productimage/nb1280/34-840-521-17.jpg",
  "LOGITECH G304 LIGHTSPEED WIRELESS GAMING MOUSE - BLACK":
    "https://c1.neweggimages.com/productimage/nb1280/A4RES23041204DJPZ23.jpg",
};

const MAX_SIZE = 5 * 1024 * 1024; // sejalan dengan cap upload-init route

/** Ambil byte gambar dan pastikan formatnya WebP (magic bytes RIFF....WEBP). */
async function fetchWebp(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const isWebp =
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP";
  if (!isWebp) throw new Error(`Bukan WebP: ${url}`);
  if (buf.length > MAX_SIZE) throw new Error(`Terlalu besar (${buf.length} B): ${url}`);
  return buf;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const force = process.argv.includes("--force");

  for (const [name, url] of Object.entries(SOURCES)) {
    const [row] = await db
      .select({ id: equipment.id, image: equipment.image })
      .from(equipment)
      .where(eq(equipment.name, name));

    if (!row) {
      console.log(`? SKIP (tidak ada di DB): ${name}`);
      continue;
    }
    if (row.image && !force) {
      console.log(`= SKIP (sudah ada gambar): ${name}`);
      continue;
    }

    const webp = await fetchWebp(url);
    console.log(`↓ ${name} — ${(webp.length / 1024).toFixed(0)} KB webp`);

    if (!commit) continue;

    const key = `equipment/${randomUUID()}.webp`;
    const fileUrl = await storage.put(key, webp, "image/webp");
    await db
      .update(equipment)
      .set({ image: fileUrl, updatedAt: new Date() })
      .where(eq(equipment.id, row.id));
    console.log(`  ✔ ${key}`);
  }

  if (!commit)
    console.log("\nDRY-RUN — tidak upload / tidak UPDATE. Tambahkan --commit untuk menyimpan.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
