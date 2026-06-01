import { cn } from "@/lib/utils";

// Base shimmer block. Compose these to mirror a page's real layout so the
// transition from loading → loaded doesn't shift the page around.
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}
