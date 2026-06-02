import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass, LayoutDashboard } from "lucide-react";

// In-app 404 (rendered inside the app shell, with navigation): used when a
// route calls notFound() — e.g. opening a job that doesn't exist.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Compass className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <p className="text-3xl font-bold tracking-tight">404</p>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/dashboard"><LayoutDashboard className="h-4 w-4" /> Back to dashboard</Link>
      </Button>
    </div>
  );
}
