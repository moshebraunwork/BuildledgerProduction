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
// where the bar is covered by the pushed screen. The center "Clock" tab is the
// entry point to the self-service clock-in flow, available to everyone.
//
// Ask AI takes the slot Invoices used to hold here; Invoices is still reachable
// from the slide-out drawer menu.

interface Tab { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: string; }

const SIDE_TABS: Tab[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/jobs",      label: "Jobs", icon: Hammer,          perm: "jobs.view" },
  // Ask AI is injected here (between Jobs and Team) when the user can use it.
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
  const { openPanel, canUse: canUseAi } = useAskAi();
  if (!TOP_LEVEL.has(pathname)) return null;

  const navTabs = SIDE_TABS.filter((t) => can(isSuperadmin, permissions, t.perm));

  // Build the ordered list of side items: nav links plus the Ask AI action,
  // placed before "Team" so it lands where Invoices used to sit.
  type Item = { kind: "link"; tab: Tab } | { kind: "ai" };
  const items: Item[] = [];
  for (const t of navTabs) {
    if (t.href === "/employees" && canUseAi) items.push({ kind: "ai" });
    items.push({ kind: "link", tab: t });
  }
  if (canUseAi && !items.some((i) => i.kind === "ai")) items.push({ kind: "ai" });

  const half = Math.ceil(items.length / 2);
  const left = items.slice(0, half);
  const right = items.slice(half);
  const clockActive = pathname === "/clock";

  const renderItem = (item: Item, idx: number) => {
    if (item.kind === "ai") {
      return (
        <button
          key={`ai-${idx}`}
          type="button"
          onClick={openPanel}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium text-muted-foreground"
        >
          <Sparkles className="h-5 w-5 text-primary" />
          <span>Ask AI</span>
        </button>
      );
    }
    const t = item.tab;
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
        <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
        <span className={cn(active && "font-semibold")}>{t.label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch rounded-t-2xl border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-md md:hidden">
      {left.map(renderItem)}

      {/* Center clock action — raised, always visible */}
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

      {right.map(renderItem)}
    </nav>
  );
}
