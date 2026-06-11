"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import { LayoutDashboard, Hammer, Users, Clock, Sparkles } from "lucide-react";
import { useAskAi } from "@/components/ask-ai/ask-ai-context";

// App-style bottom tab bar (mobile only). Shows on top-level pages and is
// hidden when drilling into a detail view (e.g. a job) — like a native app
// where the bar is covered by the pushed screen. The raised center button is
// "Ask AI"; Clock moved to a regular side tab. When the user can't use AI the
// center slot falls back to Clock so the bar keeps its shape.

interface Tab { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: string; }

const CLOCK_TAB: Tab = { href: "/clock", label: "Clock", icon: Clock, perm: "" };

const SIDE_TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/jobs",      label: "Jobs", icon: Hammer,          perm: "jobs.view" },
  // Clock is injected here (between Jobs and Team) when Ask AI holds the center.
  { href: "/employees", label: "Team", icon: Users,           perm: "employees.view" },
];

// Exact routes where the bar is shown. Anything deeper (e.g. /jobs/<id>,
// /admin/users) hides it.
const TOP_LEVEL = new Set(["/dashboard", "/jobs", "/invoices", "/inventory", "/employees", "/clock"]);

export function MobileTabBar({
  isSuperadmin, permissions,
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
}) {
  const pathname = usePathname();
  const { openPanel, open: aiOpen, canUse: canUseAi } = useAskAi();
  if (!TOP_LEVEL.has(pathname)) return null;

  const navTabs = SIDE_TABS.filter((t) => can(isSuperadmin, permissions, t.perm));

  // With Ask AI in the center, Clock becomes a side tab placed before "Team"
  // (the slot Ask AI used to hold). Without AI access, Clock keeps the center.
  const tabs: Tab[] = [];
  for (const t of navTabs) {
    if (t.href === "/employees" && canUseAi) tabs.push(CLOCK_TAB);
    tabs.push(t);
  }
  if (canUseAi && !tabs.includes(CLOCK_TAB)) tabs.push(CLOCK_TAB);

  const half = Math.ceil(tabs.length / 2);
  const left = tabs.slice(0, half);
  const right = tabs.slice(half);
  const clockActive = pathname === "/clock";

  const renderTab = (t: Tab) => {
    const Icon = t.icon;
    const active = pathname === t.href;
    return (
      <Link
        key={t.href}
        href={t.href}
        className={cn(
          "relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        {active && <span className="absolute top-0 h-1 w-8 rounded-full bg-gradient-to-r from-primary to-violet-500 shadow-[0_0_8px_hsl(var(--primary)/0.6)]" />}
        <span className={cn("rounded-xl px-3 py-0.5 transition-colors", active && "bg-primary/10")}>
          <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
        </span>
        <span className={cn(active && "font-semibold")}>{t.label}</span>
      </Link>
    );
  };

  // Raised center action: Ask AI when available, Clock otherwise.
  const center = canUseAi ? (
    <button
      type="button"
      onClick={openPanel}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 pb-1.5 text-[10px] font-medium"
    >
      <span
        className={cn(
          "-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-card shadow-lg shadow-primary/40 ring-2 ring-primary/25 transition-transform active:scale-95",
          aiOpen ? "bg-gradient-to-br from-primary to-violet-500 text-primary-foreground" : "bg-gradient-to-br from-primary/90 to-violet-500/90 text-primary-foreground"
        )}
      >
        <Sparkles className="h-6 w-6" />
      </span>
      <span className="font-semibold text-primary">Ask AI</span>
    </button>
  ) : (
    <Link href="/clock" className="flex flex-1 flex-col items-center justify-center gap-0.5 pb-1.5 text-[10px] font-medium">
      <span
        className={cn(
          "-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-card shadow-lg shadow-primary/30 ring-2 ring-primary/20 transition-transform active:scale-95",
          clockActive ? "bg-gradient-to-br from-primary to-violet-500 text-primary-foreground" : "bg-gradient-to-br from-primary/90 to-violet-500/90 text-primary-foreground"
        )}
      >
        <Clock className="h-6 w-6" />
      </span>
      <span className={cn(clockActive ? "text-primary" : "text-muted-foreground")}>Clock</span>
    </Link>
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch rounded-t-2xl border-t bg-card/90 pb-[env(safe-area-inset-bottom)] pt-0.5 shadow-[0_-6px_20px_rgba(0,0,0,0.1)] backdrop-blur-xl md:hidden">
      {left.map(renderTab)}
      {center}
      {right.map(renderTab)}
    </nav>
  );
}
