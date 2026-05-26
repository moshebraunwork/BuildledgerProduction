"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import {
  LayoutDashboard,
  Hammer,
  Boxes,
  Users,
  FileText,
  Settings,
  ScrollText,
  Shield,
  HardHat,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  { href: "/jobs", label: "Jobs", icon: Hammer, perm: "jobs.view" },
  { href: "/inventory", label: "Inventory", icon: Boxes, perm: "inventory.view" },
  { href: "/workers", label: "Workers", icon: Users, perm: "workers.view" },
  { href: "/invoices", label: "Invoices", icon: FileText, perm: "invoices.view" },
  { href: "/admin/users", label: "Admin", icon: Shield, perm: "admin.view" },
  { href: "/logs", label: "Activity Log", icon: ScrollText, perm: "logs.view" },
  { href: "/settings", label: "Settings", icon: Settings, perm: "" }, // always visible
];

export function Sidebar({
  isSuperadmin,
  permissions,
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
}) {
  const pathname = usePathname();
  const visible = NAV.filter((n) => n.perm === "" || can(isSuperadmin, permissions, n.perm));

  return (
    <aside className="hidden w-60 flex-col border-r bg-card md:flex">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
          <HardHat className="h-4 w-4" />
        </div>
        <span className="font-semibold">BuildLedger</span>
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
