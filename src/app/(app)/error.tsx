"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, LayoutDashboard } from "lucide-react";

// App-segment error boundary: catches render/runtime errors on any page under
// (app) and shows a friendly recovery screen instead of a blank crash.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for logging/monitoring.
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          An unexpected error occurred while loading this page. You can try again, or head back to your dashboard.
        </p>
        {error?.digest && <p className="text-xs text-muted-foreground/70">Reference: {error.digest}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}><RotateCcw className="h-4 w-4" /> Try again</Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard"><LayoutDashboard className="h-4 w-4" /> Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
