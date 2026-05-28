"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useClerk } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import { saveTheme } from "@/app/(app)/actions";
import {
  LayoutDashboard, Hammer, Boxes, Users, Settings as SettingsIcon,
  ScrollText, Shield, HardHat, ChevronLeft, ChevronRight, FileText,
  ChevronDown, ChevronUp, Monitor, Moon, Sun, LogOut, User as UserIcon, UserCog,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  perm: string;       // empty = always visible
  children?: NavItem[];
}

// Primary navigation. Admin is an expandable group (admin-only).
// Settings is split: app settings live under Admin; the user's own settings
// live in the profile menu at the bottom.
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
  {
    href: "/admin", label: "Admin", icon: Shield, perm: "admin.view",
    children: [
      { href: "/admin/users",     label: "Users",         icon: UserCog,    perm: "admin.users" },
      { href: "/admin/roles",     label: "Roles",         icon: Shield,     perm: "admin.roles" },
      { href: "/admin/settings",  label: "App settings",  icon: SettingsIcon, perm: "admin.company" },
      { href: "/logs",            label: "Activity log",  icon: ScrollText, perm: "logs.view" },
    ],
  },
  { href: "/jobs",       label: "Jobs",       icon: Hammer, perm: "jobs.view" },
  { href: "/invoices",   label: "Invoices",   icon: FileText, perm: "invoices.view" },
  { href: "/inventory",  label: "Inventory",  icon: Boxes,  perm: "inventory.view" },
  { href: "/employees",  label: "Employees",  icon: Users,  perm: "employees.view" },
];

const COLLAPSED_KEY = "buildledger.sidebar.collapsed";

export function Sidebar({
  isSuperadmin, permissions, email, fullName,
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
  email: string;
  fullName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const { signOut } = useClerk();

  const [collapsed, setCollapsed] = React.useState(false);
  // Restore collapsed state from localStorage on mount
  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  // Auto-expand the admin section when on an admin/* route
  const [adminOpen, setAdminOpen] = React.useState(
    pathname.startsWith("/admin") || pathname.startsWith("/logs")
  );

  const visible = NAV
    .filter((n) => n.perm === "" || can(isSuperadmin, permissions, n.perm))
    .map((n) =>
      n.children
        ? { ...n, children: n.children.filter((c) => c.perm === "" || can(isSuperadmin, permissions, c.perm)) }
        : n
    )
    .filter((n) => !n.children || n.children.length > 0);

  async function persistTheme(theme: string) {
    setTheme(theme);
    try { await saveTheme(theme); } catch { /* non-critical */ }
  }

  const initials = (fullName || email || "U").slice(0, 2).toUpperCase();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className={cn(
        "hidden flex-col border-r bg-card transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand + collapse toggle */}
      <div className={cn("flex h-14 items-center border-b", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground">
            <HardHat className="h-4 w-4" />
          </div>
          {!collapsed && <span className="font-semibold truncate">BuildLedger</span>}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          onClick={toggleCollapsed}
          className="mx-auto mt-2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        {visible.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);

          if (item.children && item.children.length > 0) {
            const childActive = item.children.some((c) => isActive(c.href));
            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => setAdminOpen((o) => !o)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    childActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                    collapsed && "justify-center px-2"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {adminOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </>
                  )}
                </button>
                {!collapsed && adminOpen && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-border pl-3">
                    {item.children.map((c) => {
                      const CIcon = c.icon;
                      const cActive = isActive(c.href);
                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                            cActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                          )}
                        >
                          <CIcon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{c.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Profile area — bottom-left */}
      <div className="border-t p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-3 rounded-md p-2 text-sm transition-colors hover:bg-accent",
                collapsed && "justify-center"
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex min-w-0 flex-1 flex-col items-start">
                  <span className="truncate text-sm font-medium">{fullName || "User"}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">{fullName || "User"}</span>
                <span className="text-xs font-normal text-muted-foreground">{email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <UserIcon className="h-4 w-4" /> My settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => persistTheme("light")}><Sun className="h-4 w-4" /> Light</DropdownMenuItem>
            <DropdownMenuItem onClick={() => persistTheme("dark")}><Moon className="h-4 w-4" /> Dark</DropdownMenuItem>
            <DropdownMenuItem onClick={() => persistTheme("system")}><Monitor className="h-4 w-4" /> System</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/login" })}>
              <LogOut className="h-4 w-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
