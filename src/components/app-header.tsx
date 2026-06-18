"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { NAV } from "@/components/nav-items";
import { NotificationsBell } from "@/components/notifications-bell";

// Desktop-only top bar: a breadcrumb (Company / View) and the notifications
// bell. Search lives in the sidebar; the primary "New job" action lives on the
// Jobs page itself.

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
  const match = Object.keys(LABELS)
    .filter((href) => pathname === href || pathname.startsWith(href + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return match ? LABELS[match] : "Dashboard";
}

export function AppHeader({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  const current = labelFor(pathname);

  return (
    <header className="hidden h-12 shrink-0 items-center gap-3 border-b bg-card/60 px-4 backdrop-blur md:flex">
      <nav className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
        <span className="truncate">{companyName}</span>
        <span className="opacity-50">/</span>
        <span className="truncate font-medium text-foreground">{current}</span>
      </nav>
      <div className="flex-1" />
      <NotificationsBell />
    </header>
  );
}
