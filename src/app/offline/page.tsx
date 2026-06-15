import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — BuildLedger",
};

// Static fallback served by the service worker when a navigation is attempted
// with no network (e.g. a crew member in a basement or a dead-zone job site).
// It must not depend on the database or auth, so it stays a plain static page.
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/30 p-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl">
        ⚡
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">You&apos;re offline</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          BuildLedger can&apos;t reach the network right now. Check your connection — the page will
          load again as soon as you&apos;re back online.
        </p>
      </div>
      <a
        href="/dashboard"
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
      >
        Try again
      </a>
    </div>
  );
}
