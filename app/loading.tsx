import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-screen-2xl mx-auto">
        <Skeleton className="h-10 w-48 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
        <div className="card mb-4">
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="card space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-11/12" />
        </div>
      </div>
    </div>
  );
}
