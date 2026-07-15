/**
 * Optimasi gambar di sisi KLIEN sebelum upload: resize (jaga rasio) lalu encode
 * ke WebP lewat canvas. Tujuannya render ringan + bandwidth upload kecil, tanpa
 * dependency server (`sharp`). Dipakai oleh widget upload gambar alat.
 *
 * `maxSize` = batas sisi terpanjang (px); gambar yang lebih kecil tidak
 * diperbesar. `quality` 0–1 untuk WebP.
 */
export async function optimizeToWebp(file: File, maxSize = 1024, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser tidak mendukung konversi gambar.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) throw new Error("Gagal mengonversi gambar ke WebP.");
    return blob;
  } finally {
    bitmap.close();
  }
}
