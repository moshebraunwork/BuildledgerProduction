"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useClerk } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import { saveTheme } from "@/app/(app)/actions";
import { NAV } from "@/components/nav-items";
import {
  HardHat, ChevronLeft, ChevronRight,
  ChevronDown, ChevronUp, Monitor, Moon, Sun, LogOut, User as UserIcon, Sparkles, Command,
} from "lucide-react";
import { useAskAi } from "@/components/ask-ai/ask-ai-context";
import { useCommandPalette } from "@/components/command-palette";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const COLLAPSED_KEY = "buildledger.sidebar.collapsed";

export function Sidebar({
  isSuperadmin, permissions, email, fullName, badges = {},
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
  email: string;
  fullName: string | null;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useTheme();
  const { signOut } = useClerk();
  const { openPanel, canUse: canUseAi } = useAskAi();
  const { open: openPalette } = useCommandPalette();

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
        "hidden flex-col border-r bg-card shadow-sm transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand + collapse toggle */}
      <div className={cn("flex h-14 items-center border-b bg-gradient-to-r from-primary/5 to-transparent", collapsed ? "justify-center px-2" : "justify-between px-4")}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-primary/20 transition-transform duration-200 hover:scale-105">
            <HardHat className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="truncate bg-gradient-to-r from-primary to-violet-500 bg-clip-text font-semibold text-transparent dark:from-foreground dark:to-violet-300">
              BuildLedger
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="rounded-full border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
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
          className="mx-auto mt-2 rounded-full border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Command palette launcher */}
      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={openPalette}
          title={collapsed ? "Command menu (⌘K)" : undefined}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <Command className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-xs">Command menu…</span>
              <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </>
          )}
        </button>
      </div>

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
                            cActive ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
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
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 hover:translate-x-0.5",
                active ? "bg-gradient-to-r from-primary/15 to-transparent text-primary shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              {active && !collapsed && <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-gradient-to-b from-primary to-violet-500 shadow-[0_0_8px_hsl(var(--primary)/0.5)]" />}
              <Icon className={cn("h-4 w-4 shrink-0 transition-transform", active && "scale-110")} />
              {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              {!collapsed && badges[item.href] > 0 && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
                  {badges[item.href]}
                </span>
              )}
              {!collapsed && item.shortcut && !(badges[item.href] > 0) && (
                <span className="font-mono text-[10px] text-muted-foreground/70">{item.shortcut}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Ask AI launcher — sits just above the profile */}
      {canUseAi && (
        <div className="px-2 pb-1">
          <button
            type="button"
            onClick={openPanel}
            title={collapsed ? "Ask AI" : undefined}
            className={cn(
              "group flex w-full items-center gap-3 rounded-lg border border-primary/20 bg-gradient-to-r from-primary/10 to-violet-500/10 px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:from-primary/20 hover:to-violet-500/20 hover:shadow-[0_0_12px_hsl(var(--primary)/0.25)]",
              collapsed && "justify-center px-2"
            )}
          >
            <Sparkles className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-hover:rotate-12 group-hover:scale-110" />
            {!collapsed && <span className="truncate">Ask AI</span>}
          </button>
        </div>
      )}

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
              <span className="relative shrink-0">
                <Avatar className="h-8 w-8 ring-2 ring-primary/20 ring-offset-1 ring-offset-card">
                  <AvatarFallback className="bg-gradient-to-br from-primary/15 to-violet-500/15 text-foreground">{initials}</AvatarFallback>
                </Avatar>
                {/* Presence dot — signed-in indicator */}
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500" />
              </span>
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
