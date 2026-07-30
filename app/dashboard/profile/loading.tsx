import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <main className="flex flex-col gap-6 p-6 sm:p-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex flex-col gap-4 rounded-lg border p-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-8 w-20 mt-2" />
      </div>
    </main>
  );
}
