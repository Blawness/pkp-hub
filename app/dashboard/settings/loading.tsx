import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function SettingsLoading() {
  return (
    <main className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
      <TableSkeleton cols={4} />
    </main>
  );
}
