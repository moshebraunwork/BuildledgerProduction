"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import { LayoutDashboard, Hammer, FileText, Users, Clock } from "lucide-react";

// App-style bottom tab bar (mobile only). Shows on top-level pages and is
// hidden when drilling into a detail view (e.g. a job) — like a native app
// where the bar is covered by the pushed screen. The center "Clock" tab is the
// entry point to the self-service clock-in flow, available to everyone.

interface Tab { href: string; label: string; icon: React.ComponentType<{ className?: string }>; perm: string; }

const SIDE_TABS: Tab[] = [
  { href: "/dashboard", label: "Home",     icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/jobs",      label: "Jobs",     icon: Hammer,          perm: "jobs.view" },
  { href: "/invoices",  label: "Invoices", icon: FileText,        perm: "invoices.view" },
  { href: "/employees", label: "Team",     icon: Users,           perm: "employees.view" },
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
  if (!TOP_LEVEL.has(pathname)) return null;

  const visible = SIDE_TABS.filter((t) => can(isSuperadmin, permissions, t.perm));
  const half = Math.ceil(visible.length / 2);
  const left = visible.slice(0, half);
  const right = visible.slice(half);
  const clockActive = pathname === "/clock";

  const Item = ({ t }: { t: Tab }) => {
    const Icon = t.icon;
    const active = pathname === t.href;
    return (
      <Link
        href={t.href}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        <Icon className="h-5 w-5" />
        <span>{t.label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
      {left.map((t) => <Item key={t.href} t={t} />)}

      {/* Center clock action — raised, always visible */}
      <Link href="/clock" className="flex flex-1 flex-col items-center justify-center gap-0.5 pb-1.5 text-[10px] font-medium">
        <span
          className={cn(
            "-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-4 border-card shadow-lg transition-colors",
            clockActive ? "bg-primary text-primary-foreground" : "bg-primary/90 text-primary-foreground"
          )}
        >
          <Clock className="h-6 w-6" />
        </span>
        <span className={cn(clockActive ? "text-primary" : "text-muted-foreground")}>Clock</span>
      </Link>

      {right.map((t) => <Item key={t.href} t={t} />)}
    </nav>
  );
}
