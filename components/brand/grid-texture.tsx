/**
 * Motif grid — tekstur khas merek ini (kertas milimeter surveyor), dipakai oleh
 * panel brand di `/` dan `/login` serta oleh sidebar dashboard.
 *
 * Definisinya tinggal di satu tempat justru karena kedua pemakainya berbeda:
 * BrandPanel menggeser grid ini dengan parallax lewat <motion.div>, sedangkan
 * sidebar memakainya diam. Yang boleh berbeda adalah gerakannya, bukan
 * motifnya — kalau string gradien ini disalin dua kali, cepat atau lambat
 * ukurannya berbeda dan tekstur di dua layar tidak lagi terasa satu keluarga.
 */

/** Garis grid: aksen merek pada opasitas sangat rendah, tanpa aset gambar. */
export const GRID_BACKGROUND_IMAGE =
  "linear-gradient(to right, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklch, var(--brand-accent), transparent 92%) 1px, transparent 1px)";

export const GRID_BACKGROUND_SIZE = "48px 48px";

/** Varian diam, untuk permukaan yang tidak melakukan parallax. */
export function GridTexture({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{
        backgroundImage: GRID_BACKGROUND_IMAGE,
        backgroundSize: GRID_BACKGROUND_SIZE,
      }}
    />
  );
}
