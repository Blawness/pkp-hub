import { TableSkeleton } from "./table-skeleton"
import { cn } from "@/lib/utils"

/**
 * Wraps content with consistent loading state. Shows skeleton while
 * data is loading, then fades in real content.
 *
 * Types:
 * - `table`: Multi-row skeleton (for data tables)
 * - `list`: Stack of skeleton items (for lists)
 * - `card`: Single large skeleton (for detail pages)
 */

export function LoadingContainer({
  isLoading,
  type = "table",
  rows = 5,
  cols = 4,
  children,
  className,
}: {
  isLoading: boolean
  type?: "table" | "list" | "card"
  rows?: number
  cols?: number
  children: React.ReactNode
  className?: string
}) {
  if (isLoading) {
    if (type === "table") {
      return <TableSkeleton rows={rows} cols={cols} />
    }

    if (type === "list") {
      return (
        <div className={cn("space-y-3", className)}>
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-md bg-muted animate-pulse"
              aria-hidden
            />
          ))}
        </div>
      )
    }

    // card type
    return (
      <div
        className={cn("h-32 rounded-md bg-muted animate-pulse", className)}
        aria-hidden
      />
    )
  }

  return <>{children}</>
}
