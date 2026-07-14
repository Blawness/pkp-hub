/**
 * Identitas studio untuk kop kwitansi.
 *
 * Konstanta, bukan tabel `settings` + form: ini tool SATU studio (non-goal PRD
 * §1.3 — multi-tenant). Halaman pengaturan berarti tabel, action, guard, dan
 * form untuk sesuatu yang berubah sekali dalam beberapa tahun. Menggantinya =
 * satu commit, dan itu sepadan.
 *
 * Data kontak (alamat/telepon/email/kota) sudah diambil dari situs resmi
 * presisikonsulindo.com — nilai asli. Nama penanda tangan BELUM dikonfirmasi
 * dari sumber publik; ganti `signerName` dengan nama direktur yang berwenang
 * sebelum kwitansi pertama dikirim ke klien.
 */
export const STUDIO = {
  name: "PT PRESISI KONSULINDO PRIMA",
  address: "Gedung Yarnati Lt. 4, Jl. Proklamasi No. 44, Menteng, Jakarta Pusat 10320",
  phone: "(021) 3928018",
  email: "presisikonsulindo@gmail.com",
  city: "Jakarta Pusat",
  signerName: "Yudha",
  signerTitle: "Direktur",
} as const;
