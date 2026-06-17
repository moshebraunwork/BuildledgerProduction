"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Plus, Search } from "lucide-react";
import { NAV } from "@/components/nav-items";
import { useCommandPalette } from "@/components/command-palette";
import { cn } from "@/lib/utils";

// Desktop-only top bar: breadcrumb (Company / View), a global ⌘K search trigger,
// a notifications bell, and the primary "New job" action — mirroring the
// Workstock prototype. Mobile keeps its own top bar (MobileNav).

// Flatten the nav into href → label, plus the routes that aren't in the sidebar.
const LABELS: Record<string, string> = (() => {
  const map: Record<string, string> = {
    "/customers": "Customers",
    "/schedule": "Schedule",
    "/settings": "Settings",
    "/clock": "Time clock",
    "/logs": "Activity log",
  };
  const walk = (items: typeof NAV) => {
    for (const n of items) {
      map[n.href] = n.label;
      if (n.children) walk(n.children);
    }
  };
  walk(NAV);
  return map;
})();

function labelFor(pathname: string): string {
  if (LABELS[pathname]) return LABELS[pathname];
  // Longest matching prefix (handles /jobs/[id] → "Jobs", /admin/* → child).
  const match = Object.keys(LABELS)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return match ? LABELS[match] : "Dashboard";
}

export function AppHeader({
  companyName,
  canEditJobs,
}: {
  companyName: string;
  canEditJobs: boolean;
}) {
  const pathname = usePathname();
  const { open } = useCommandPalette();
  const [bellOpen, setBellOpen] = React.useState(false);
  const bellRef = React.useRef<HTMLDivElement>(null);
  const current = labelFor(pathname);

  React.useEffect(() => {
    if (!bellOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [bellOpen]);

  return (
    <header className="hidden h-12 shrink-0 items-center gap-3 border-b bg-card/60 px-4 backdrop-blur md:flex">
      {/* Breadcrumb */}
      <nav className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
        <span className="truncate">{companyName}</span>
        <span className="opacity-50">/</span>
        <span className="truncate font-medium text-foreground">{current}</span>
      </nav>

      <div className="flex-1" />

      {/* Global search → command palette */}
      <button
        type="button"
        onClick={open}
        className="flex min-w-[240px] items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-left text-muted-foreground transition-colors hover:bg-accent"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-xs">Search jobs, customers, parts…</span>
        <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>

      {/* Notifications */}
      <div className="relative" ref={bellRef}>
        <button
          type="button"
          onClick={() => setBellOpen((o) => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border text-foreground transition-colors hover:bg-accent"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>
        {bellOpen && (
          <div className="ws-fade absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-xl border bg-popover shadow-xl">
            <div className="border-b px-4 py-2.5 text-sm font-semibold">Notifications</div>
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up.
            </div>
          </div>
        )}
      </div>

      {/* Primary action */}
      {canEditJobs && (
        <Link
          href="/jobs?new=1"
          className={cn(
            "flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          New job
          <kbd className="ml-1 border-l border-primary-foreground/30 pl-1.5 font-mono text-[10px] opacity-70">N</kbd>
        </Link>
      )}
    </header>
  );
}
