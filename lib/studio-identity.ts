/**
 * Identitas studio untuk kop kwitansi.
 *
 * Konstanta, bukan tabel `settings` + form: ini tool SATU studio (non-goal PRD
 * §1.3 — multi-tenant). Halaman pengaturan berarti tabel, action, guard, dan
 * form untuk sesuatu yang berubah sekali dalam beberapa tahun. Menggantinya =
 * satu commit, dan itu sepadan.
 *
 * TODO(manusia): ganti alamat/telepon/penanda tangan dengan data PKP yang
 * sebenarnya sebelum kwitansi pertama dikirim ke klien.
 */
export const STUDIO = {
  name: "PT PRESISI KONSULINDO PRIMA",
  address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
  phone: "021-0000-0000",
  email: "halo@pkp.co.id",
  city: "Jakarta",
  signerName: "Yudha",
  signerTitle: "Direktur",
} as const;
