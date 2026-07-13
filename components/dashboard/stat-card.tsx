import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Metrik utama dashboard.
 *
 * `tabular-nums` bukan kemewahan: tanpa itu, angka rupiah yang berubah lebar
 * digitnya akan membuat kartu bergoyang saat data dimuat ulang.
 *
 * `tone="warning"` hanya untuk angka yang benar-benar menuntut perhatian
 * (mis. tagihan belum lunas > 0). Kalau dipakai untuk hiasan, ia berhenti
 * berarti apa-apa.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: "default" | "warning";
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex flex-col gap-1 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">{label}</span>
          <Icon
            aria-hidden
            className={cn(
              "size-4 shrink-0",
              tone === "warning" ? "text-amber-500" : "text-muted-foreground/50",
            )}
          />
        </div>

        <span
          className={cn(
            "font-heading text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl",
            tone === "warning" && "text-amber-600 dark:text-amber-400",
          )}
        >
          {value}
        </span>

        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </CardContent>
    </Card>
  );
}
