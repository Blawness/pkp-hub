import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function EquipmentLoading() {
  return (
    <main className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <TableSkeleton cols={4} />
    </main>
  );
}
