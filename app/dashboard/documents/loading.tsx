import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function DocumentsLoading() {
  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholder count, list never reorders.
          <Skeleton key={i} className="h-8 w-36" />
        ))}
      </div>
      <TableSkeleton cols={7} />
    </main>
  );
}
