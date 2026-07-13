/** Indonesian display labels for enum values (PRD's UI copy is Indonesian). */

export const roleLabel: Record<string, string> = {
  owner: "Owner",
  surveyor: "Surveyor",
  client: "Klien",
};

export const statusLabel: Record<string, string> = {
  baru: "Baru",
  dijadwalkan: "Dijadwalkan",
  data_diambil: "Data Diambil",
  diproses: "Diproses",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
};

export const surveyTypeLabel: Record<string, string> = {
  topografi: "Topografi",
  kavling: "Kavling",
  batas_tanah: "Batas Tanah",
  luas_bangunan: "Luas Bangunan",
  lainnya: "Lainnya",
};

export const clientTypeLabel: Record<string, string> = {
  individual: "Perorangan",
  company: "Perusahaan",
};

export const documentCategoryLabel: Record<string, string> = {
  laporan: "Laporan",
  berita_acara: "Berita Acara",
  foto_lapangan: "Foto Lapangan",
  sertifikat: "Sertifikat/Legalitas",
  data_mentah: "Data Mentah",
  lainnya: "Lainnya",
};

export const paymentStatusLabel: Record<string, string> = {
  belum: "Belum Dibayar",
  sebagian: "Dibayar Sebagian",
  lunas: "Lunas",
};

export const projectStatusOrder = [
  "baru",
  "dijadwalkan",
  "data_diambil",
  "diproses",
  "selesai",
  "dibatalkan",
] as const;
