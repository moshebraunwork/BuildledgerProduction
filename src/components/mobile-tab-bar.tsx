"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import { Hammer, FileText, Users, Clock, Sparkles } from "lucide-react";
import { useAskAi } from "@/components/ask-ai/ask-ai-context";

// App-style bottom tab bar (mobile only). Shows on top-level pages and is
// hidden when drilling into a detail view (e.g. a job) — like a native app
// where the bar is covered by the pushed screen. The raised center button is
// "Ask AI"; Clock moved to a regular side tab. When the user can't use AI the
// center slot falls back to Clock so the bar keeps its shape.

interface Tab { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: string; }

const CLOCK_TAB: Tab = { href: "/clock", label: "Clock", icon: Clock, perm: "" };

// No Dashboard on mobile — Jobs is the phone's home screen.
const SIDE_TABS: Tab[] = [
  { href: "/jobs",      label: "Jobs",     icon: Hammer,   perm: "jobs.view" },
  { href: "/invoices",  label: "Invoices", icon: FileText, perm: "invoices.view" },
  // Clock is injected here (before Team) when Ask AI holds the center.
  { href: "/employees", label: "Team",     icon: Users,    perm: "employees.view" },
];

// Exact routes where the bar is shown. Anything deeper (e.g. /jobs/<id>,
// /admin/users) hides it.
const TOP_LEVEL = new Set(["/jobs", "/invoices", "/inventory", "/employees", "/clock"]);

export function MobileTabBar({
  isSuperadmin, permissions,
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
}) {
  const pathname = usePathname();
  const { openPanel, open: aiOpen, canUse: canUseAi } = useAskAi();

  // Refs to each route tab's anchor so we can measure where the rolling-ball
  // indicator should sit, and the nav itself for a relative origin.
  const navRef = React.useRef<HTMLElement>(null);
  const tabRefs = React.useRef<Map<string, HTMLElement>>(new Map());
  const setTabRef = (href: string) => (el: HTMLAnchorElement | null) => {
    if (el) tabRefs.current.set(href, el);
    else tabRefs.current.delete(href);
  };

  // The ball's centre-x (px from the nav's left edge) and its accumulated
  // rotation. Rotation is derived from x so translating and spinning stay in
  // lock-step → it reads as a ball rolling from the old tab to the new one.
  const BALL = 16; // px diameter
  const CIRC = Math.PI * BALL; // distance for one full revolution
  const [ball, setBall] = React.useState<{ x: number; r: number } | null>(null);

  React.useEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      const active = tabRefs.current.get(pathname);
      if (!nav || !active) {
        setBall(null);
        return;
      }
      const nb = nav.getBoundingClientRect();
      const ab = active.getBoundingClientRect();
      const x = ab.left - nb.left + ab.width / 2;
      setBall({ x, r: (x / CIRC) * 360 });
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [pathname, canUseAi, CIRC]);

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
        ref={setTabRef(t.href)}
        className="flex flex-1 flex-col items-center justify-center py-1.5 text-[11px] font-medium"
      >
        {/* One perfectly-rounded pill wraps the icon AND the label when active. */}
        <span
          className={cn(
            "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-full px-4 py-1.5 transition-colors",
            active ? "bg-primary/10 text-primary shadow-sm shadow-primary/20" : "text-muted-foreground"
          )}
        >
          <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
          <span className={cn(active && "font-semibold")}>{t.label}</span>
        </span>
      </Link>
    );
  };

  // Raised center action: Ask AI when available, Clock otherwise.
  const center = canUseAi ? (
    <button
      type="button"
      onClick={openPanel}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 pb-1.5 text-[11px] font-medium"
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
    <Link href="/clock" ref={setTabRef("/clock")} className="flex flex-1 flex-col items-center justify-center gap-0.5 pb-1.5 text-[11px] font-medium">
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
    <nav
      ref={navRef}
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch rounded-t-2xl border-t bg-card/90 pb-[env(safe-area-inset-bottom)] pt-0.5 shadow-[0_-6px_20px_rgba(0,0,0,0.1)] backdrop-blur-xl md:hidden"
    >
      {/* Rolling-ball indicator: a glossy sphere that rolls along the top rail
          to whichever tab is active. The wrapper translates to the tab's centre
          while the inner ball spins, so the two read as a single rolling ball. */}
      {ball && (
        <span className="tab-ball-wrap" style={{ transform: `translateX(${ball.x}px)` }} aria-hidden>
          <span className="tab-ball" style={{ transform: `rotate(${ball.r}deg)` }} />
        </span>
      )}
      {left.map(renderTab)}
      {center}
      {right.map(renderTab)}
    </nav>
  );
}
