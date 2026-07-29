/**
 * Render ikon PWA dari `public/logo pkp.svg` ke seluruh ukuran yang dibutuhkan
 * browser. Dijalankan satu kali setelah logo berubah.
 *
 *   pnpm tsx scripts/generate-pwa-icons.ts
 *
 * Output:
 *   public/icon-192.png         — Android/Chrome minimum
 *   public/icon-512.png         — Android/Chrome minimum
 *   public/maskable-icon-512.png — Android adaptive icon (ada safe-zone)
 *   public/apple-touch-icon.png  — iOS "Add to Home Screen" (180x180)
 *
 * Mengapa tidak langsung pakai SVG di manifest: Android WebApp tidak mau
 * install tanpa PNG 192 + 512, dan Apple touch icon harus raster. Sharp lebih
 * akurat dari `sips`/`convert` karena memahami SVG path.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(process.cwd());
const PUBLIC = path.join(ROOT, "public");
const SOURCE = path.join(PUBLIC, "logo pkp.svg");

// Latar solid untuk varian maskable: safe-zone Android adaptive icon
// menyarankan konten vital di tengah 80% (40% padding tiap sisi). Kita
// isi background dengan brand-primary agar splash screen match dengan
// theme_color manifest.
const BRAND_BG = "#1b6fd8";

async function renderSquare(size: number, file: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 500 500"><rect width="500" height="500" fill="${BRAND_BG}"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(PUBLIC, file), png);
  console.log(`  ✓ ${file} (${size}x${size}, solid brand bg)`);
}

async function renderIcon(size: number, file: string, paddingPct = 0) {
  const raw = await readFile(SOURCE);
  const inner = await sharp(raw)
    .resize({
      width: size,
      height: size,
      fit: "contain",
      background: BRAND_BG,
    })
    .toBuffer();

  if (paddingPct === 0) {
    await writeFile(path.join(PUBLIC, file), inner);
    console.log(`  ✓ ${file} (${size}x${size})`);
    return;
  }
  const paddedSize = Math.round(size / (1 - paddingPct * 2));
  const pad = Math.round((paddedSize - size) / 2);
  const out = await sharp({
    create: {
      width: paddedSize,
      height: paddedSize,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: inner, top: pad, left: pad }])
    .png()
    .toBuffer();
  await writeFile(path.join(PUBLIC, file), out);
  console.log(`  ✓ ${file} (${paddedSize}x${paddedSize}, pad ${Math.round(paddingPct * 100)}%)`);
}

async function main() {
  await mkdir(PUBLIC, { recursive: true });

  console.log("Generating PWA icons from public/logo pkp.svg …");

  // Placeholder solid-color squares dipakai sementara kalau SVG gagal di-parse
  // oleh sharp (mis. filter SVG yang tidak dikenal). Sharp lebih toleran
  // dibanding browser, jadi biasanya tidak terpakai.
  await renderSquare(192, "icon-192.fallback.png");
  await renderSquare(512, "icon-512.fallback.png");

  // Ikon utama (no padding — logo sudah punya margin internal sendiri).
  await renderIcon(192, "icon-192.png");
  await renderIcon(512, "icon-512.png");

  // Maskable: 10% padding biar aman dari mask bulat Android launcher.
  await renderIcon(512, "maskable-icon-512.png", 0.1);

  // Apple touch icon — 180x180 khusus iOS, logo sudah di tengah jadi
  // tidak perlu padding ekstra (iOS tidak crop, cuma membulatkan sudut).
  await renderIcon(180, "apple-touch-icon.png");

  console.log("\nSelesai. File ada di public/. Daftarkan di app/manifest.ts.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
