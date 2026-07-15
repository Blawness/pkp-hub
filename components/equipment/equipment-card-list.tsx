"use client";

import { ImageIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BorrowDialog } from "@/components/equipment/borrow-dialog";
import type { EquipmentTableRow } from "@/components/equipment/equipment-columns";
import { ReturnButton } from "@/components/equipment/return-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { equipmentCategoryLabel, equipmentConditionLabel } from "@/lib/labels";

const conditionVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  tersedia: "secondary",
  perawatan: "outline",
  rusak: "destructive",
  pensiun: "outline",
};

/**
 * Daftar alat sebagai kartu — dipakai di viewport HP (`md:hidden` di
 * `EquipmentTable`). Surveyor lapangan sering di HP; kartu jauh lebih enak
 * dibanding tabel 5 kolom yang menggulir menyamping. Aksi Pinjam/Kembalikan
 * memakai komponen klien yang sama dengan tabel desktop.
 */
export function EquipmentCardList({
  rows,
  isAdmin,
  projectOptions,
  surveyors,
}: {
  rows: EquipmentTableRow[];
  isAdmin: boolean;
  projectOptions: { id: string; title: string }[];
  surveyors: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.serialNumber ?? "").toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="flex flex-col gap-3">
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari alat…" />
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Tidak ada alat.</p>
      ) : (
        filtered.map((item) => (
          <Card key={item.id} className="flex flex-col gap-3 p-3">
            <div className="flex items-start gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {item.image ? (
                  // biome-ignore lint/performance/noImgElement: gambar hasil upload, bukan aset statis
                  <img src={item.image} alt={item.name} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/dashboard/equipment/${item.id}`}
                  className="font-medium hover:underline"
                >
                  {item.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {equipmentCategoryLabel[item.category] ?? item.category}
                  {item.serialNumber ? ` · SN ${item.serialNumber}` : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              {item.activeUsage ? (
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Badge className="w-fit">Terpinjam</Badge>
                  <span className="truncate text-xs text-muted-foreground">
                    {item.activeUsage.usedByName} · {item.activeUsage.projectTitle}
                  </span>
                </div>
              ) : (
                <Badge variant={conditionVariant[item.condition] ?? "secondary"}>
                  {equipmentConditionLabel[item.condition] ?? item.condition}
                </Badge>
              )}

              {item.activeUsage ? (
                item.activeUsage.canReturn ? (
                  <ReturnButton
                    usageId={item.activeUsage.usageId}
                    equipmentName={item.name}
                    durationLabel={item.activeUsage.durationLabel}
                  />
                ) : null
              ) : item.canBorrow ? (
                <BorrowDialog
                  fixedEquipment={{ id: item.id, name: item.name }}
                  projectOptions={projectOptions}
                  isAdmin={isAdmin}
                  surveyors={surveyors}
                  trigger={
                    <Button size="sm" variant="outline">
                      Pinjam
                    </Button>
                  }
                />
              ) : null}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
