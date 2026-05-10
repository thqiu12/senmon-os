import { HTMLAttributes } from "react";

/**
 * Visual placeholder shown during data loading. Compose at the call site:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton variant="rect" className="h-32 w-full" />
 */
export function Skeleton({
  className = "",
  variant = "rect",
  ...rest
}: HTMLAttributes<HTMLDivElement> & { variant?: "rect" | "circle" | "text" }) {
  const shape =
    variant === "circle" ? "rounded-full" : variant === "text" ? "rounded h-4" : "rounded-md";
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-gray-200/80 ${shape} ${className}`}
      {...rest}
    />
  );
}

/** Pre-baked skeleton patterns for the most common loading states. */
export function SkeletonCard() {
  return (
    <div className="card space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 6 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={`h-4 ${i === 0 ? "w-24" : "flex-1"}`} />
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} cols={cols} />
      ))}
    </div>
  );
}
