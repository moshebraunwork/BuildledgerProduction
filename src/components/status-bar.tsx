"use client";

import * as React from "react";

// Desktop-only status footer — a live "connected" pulse, company / team facts,
// a relative "last synced" clock, and keyboard-shortcut hints. Echoes the
// Workstock prototype's status bar.
export function StatusBar({
  plan,
  employeeCount,
}: {
  plan: string;
  employeeCount: number;
}) {
  const [secs, setSecs] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setSecs((s) => s + 5), 5000);
    return () => clearInterval(t);
  }, []);

  const synced = secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`;

  return (
    <footer className="hidden h-6 shrink-0 items-center gap-3 border-t bg-card/60 px-4 font-mono text-[10.5px] text-muted-foreground backdrop-blur md:flex">
      <span className="flex items-center gap-1.5">
        <span className="ws-pulse inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
        connected
      </span>
      <span className="opacity-50">·</span>
      <span className="truncate">{plan}</span>
      <span className="opacity-50">·</span>
      <span>{employeeCount} {employeeCount === 1 ? "employee" : "employees"}</span>
      <span className="opacity-50">·</span>
      <span>last sync {synced}</span>
      <div className="flex-1" />
      <span className="hidden lg:inline">⌘K search</span>
      <span className="hidden lg:inline">N new job</span>
      <span className="hidden lg:inline">G then J jobs</span>
      <span className="hidden lg:inline">D theme</span>
    </footer>
  );
}
