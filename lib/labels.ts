/** Indonesian display labels for enum values (PRD's UI copy is Indonesian). */

export const roleLabel: Record<string, string> = {
  admin: "Admin",
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

export const paymentMethodLabel: Record<string, string> = {
  transfer: "Transfer",
  tunai: "Tunai",
  lainnya: "Lainnya",
};

export const phaseStatusLabel: Record<string, string> = {
  belum: "Belum Mulai",
  berjalan: "Berjalan",
  selesai: "Selesai",
};

export const equipmentCategoryLabel: Record<string, string> = {
  instrumen_ukur: "Instrumen Ukur",
  gps_rtk: "GPS RTK",
  drone: "Drone",
  aksesoris_survey: "Aksesoris Survey",
  laptop: "Laptop",
  inventaris_kantor: "Inventaris Kantor",
  lainnya: "Lainnya",
};

export const equipmentConditionLabel: Record<string, string> = {
  tersedia: "Tersedia",
  perawatan: "Perawatan",
  rusak: "Rusak",
  pensiun: "Pensiun",
};

export const projectStatusOrder = [
  "baru",
  "dijadwalkan",
  "data_diambil",
  "diproses",
  "selesai",
  "dibatalkan",
] as const;

/** Tailwind color classes untuk badge aksi di audit-log & timeline. */
export const actionBadge: Record<string, string> = {
  create: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
  update: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
  delete: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  archive: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  restore: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  login: "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
  assign: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400",
  void: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
};
