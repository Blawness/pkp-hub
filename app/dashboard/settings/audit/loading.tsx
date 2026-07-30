import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function AuditLoading() {
  return (
    <main className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-40" />
      </div>
      <TableSkeleton cols={6} />
    </main>
  );
}
