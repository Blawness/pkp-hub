import { Skeleton } from "@/components/ui/skeleton"

/** Generic loading placeholder for a `DataTable` row list (Phase 8 polish). */
export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <div className="flex gap-4 border-b border-border p-3">
        {Array.from({ length: cols }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder count, list never reorders.
          <Skeleton key={i} className="h-3 w-20" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder count, list never reorders.
        <div key={i} className="flex gap-4 border-b border-border p-3 last:border-0">
          {Array.from({ length: cols }).map((_, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder count, list never reorders.
            <Skeleton key={j} className="h-4 w-24" />
          ))}
        </div>
      ))}
    </div>
  )
}
