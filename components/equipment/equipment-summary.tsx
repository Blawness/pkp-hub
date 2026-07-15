import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Stat = { key: string; label: string; value: number };

/**
 * Kartu ringkasan di atas daftar alat, sekaligus quick-filter. Angkanya
 * DITURUNKAN dari daftar alat di `page.tsx` (bukan kolom tersimpan) dan tiap
 * kartu meng-set `?status=` — cermin dari filter yang sudah ada, jadi jumlah
 * di kartu persis sama dengan hasil filternya. `activeStatus` menyorot kartu
 * yang cocok dengan filter aktif.
 */
export function EquipmentSummary({
  total,
  tersedia,
  terpinjam,
  perawatan,
  rusak,
  activeStatus,
}: {
  total: number;
  tersedia: number;
  terpinjam: number;
  perawatan: number;
  rusak: number;
  activeStatus: string;
}) {
  const stats: Stat[] = [
    { key: "", label: "Total", value: total },
    { key: "tersedia", label: "Tersedia", value: tersedia },
    { key: "terpinjam", label: "Terpinjam", value: terpinjam },
    { key: "perawatan", label: "Perawatan", value: perawatan },
    { key: "rusak", label: "Rusak", value: rusak },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat) => {
        const active = activeStatus === stat.key;
        const href = stat.key ? `/dashboard/equipment?status=${stat.key}` : "/dashboard/equipment";
        return (
          <Link key={stat.key || "total"} href={href}>
            <Card
              className={cn(
                "flex flex-col gap-0.5 p-3 transition-colors hover:bg-muted/50",
                active && "ring-2 ring-primary",
              )}
            >
              <span className="text-2xl font-semibold tabular-nums">{stat.value}</span>
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
