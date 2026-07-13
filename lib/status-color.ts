/**
 * Bahasa warna status proyek — satu definisi, dipakai lencana di tabel proyek,
 * pipeline di dashboard, dan halaman detail.
 *
 * Sebelum ini semua status memakai satu lencana `secondary`, sehingga "Selesai"
 * dan "Dibatalkan" tampil identik. Urutan warnanya mengikuti alur kerja: abu
 * (belum disentuh) → kuning (dijadwalkan) → biru (sedang berjalan) → hijau
 * (tuntas), dengan merah khusus untuk dibatalkan.
 *
 * Warna tidak pernah jadi satu-satunya penanda: setiap pemakainya selalu
 * menampilkan label status juga, jadi status tetap terbaca oleh pengguna buta
 * warna dan pembaca layar.
 */
export type StatusTone = {
  /** Latar + teks untuk lencana. */
  badge: string;
  /** Isi batang pipeline / titik penanda. */
  fill: string;
};

const NEUTRAL: StatusTone = {
  badge: "bg-muted text-muted-foreground",
  fill: "bg-muted-foreground/40",
};

export const statusTone: Record<string, StatusTone> = {
  baru: {
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
    fill: "bg-slate-400",
  },
  dijadwalkan: {
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    fill: "bg-amber-500",
  },
  data_diambil: {
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    fill: "bg-sky-500",
  },
  diproses: {
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    fill: "bg-violet-500",
  },
  selesai: {
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    fill: "bg-emerald-500",
  },
  dibatalkan: {
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    fill: "bg-rose-500",
  },
};

export function toneFor(status: string): StatusTone {
  return statusTone[status] ?? NEUTRAL;
}
