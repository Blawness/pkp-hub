import type { ReactNode } from "react";

/**
 * Kepala halaman: judul, deskripsi, dan aksi utama di kanan.
 *
 * Pola ini sebelumnya disalin apa adanya di setiap halaman dashboard. Selama
 * masih disalin, ketiganya kebetulan sama — dan akan berhenti sama begitu satu
 * halaman disentuh tanpa yang lain. Di sini ukuran judul, jarak, dan perilaku
 * bungkus di layar sempit ditetapkan satu kali.
 *
 * `action` adalah slot: halaman menyodorkan tombolnya sendiri (dan aturan
 * role-nya sendiri soal boleh-tidaknya tombol itu ada), bukan komponen ini
 * yang menebak-nebak.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-balance text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
