"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useClerk } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import { saveTheme, recordSignOut } from "@/app/(app)/actions";
import { NAV } from "@/components/nav-items";
import { HardHat, Menu, X, Monitor, Moon, Sun, LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Mobile top bar + slide-in drawer. Hidden on md+ where the desktop sidebar
// takes over. Fills the gap where small screens previously had no navigation.
export function MobileNav({
  isSuperadmin, permissions, email, fullName,
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
  email: string;
  fullName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { signOut } = useClerk();
  const [open, setOpen] = React.useState(false);

  async function persistTheme(next: string) {
    setTheme(next);
    try { await saveTheme(next); } catch { /* non-critical */ }
  }

  // Record the sign-out (best-effort) before Clerk tears down the session.
  async function handleSignOut() {
    try { await recordSignOut(); } catch { /* non-critical */ }
    await signOut({ redirectUrl: "/login" });
  }

  const initials = (fullName || email || "U").slice(0, 2).toUpperCase();

  // Close on navigation.
  React.useEffect(() => { setOpen(false); }, [pathname]);

  // Lock body scroll while the drawer is open.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const visible = NAV
    .filter((n) => n.perm === "" || can(isSuperadmin, permissions, n.perm))
    .map((n) =>
      n.children
        ? { ...n, children: n.children.filter((c) => c.perm === "" || can(isSuperadmin, permissions, c.perm)) }
        : n
    )
    .filter((n) => !n.children || n.children.length > 0);

  const NavLink = ({ href, label, Icon, active, small }: {
    href: string; label: string; Icon: React.ComponentType<{ className?: string }>; active: boolean; small?: boolean;
  }) => (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        small ? "py-2" : "py-2.5",
        active ? "bg-gradient-to-r from-primary/15 to-transparent text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {active && <span className="absolute inset-y-1 left-0 w-1 rounded-r-full bg-gradient-to-b from-primary to-violet-500" />}
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <>
      {/* Top bar (mobile only) */}
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-card/95 px-3 shadow-sm backdrop-blur-md md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-sm">
            <HardHat className="h-4 w-4" />
          </div>
          <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text font-semibold text-transparent dark:from-foreground dark:to-violet-300">BuildLedger</span>
        </div>
      </header>

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-200 md:hidden",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!open}
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
        <div
          className={cn(
            "absolute left-0 top-0 flex h-full w-72 max-w-[82%] flex-col border-r bg-card shadow-xl transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full"
          )}
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-14 items-center justify-between border-b px-4">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-sm">
                <HardHat className="h-4 w-4" />
              </div>
              <span className="bg-gradient-to-r from-primary to-violet-500 bg-clip-text font-semibold text-transparent dark:from-foreground dark:to-violet-300">BuildLedger</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {visible.map((item) => {
              if (item.children && item.children.length > 0) {
                return (
                  <div key={item.href} className="pt-2">
                    <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    {item.children.map((c) => (
                      <NavLink key={c.href} href={c.href} label={c.label} Icon={c.icon} active={isActive(c.href)} small />
                    ))}
                  </div>
                );
              }
              return <NavLink key={item.href} href={item.href} label={item.label} Icon={item.icon} active={isActive(item.href)} />;
            })}
          </nav>

          {/* Profile footer — identity, theme preference and sign out. */}
          <div className="border-t p-3 space-y-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0 ring-2 ring-primary/20 ring-offset-1 ring-offset-card">
                <AvatarFallback className="bg-gradient-to-br from-primary/15 to-violet-500/15 text-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{fullName || "User"}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
            </div>

            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <UserIcon className="h-4 w-4 shrink-0" />
              My settings
            </Link>

            <div className="space-y-1">
              <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Theme</p>
              <div className="grid grid-cols-3 gap-1">
                {([
                  { key: "light", label: "Light", Icon: Sun },
                  { key: "dark", label: "Dark", Icon: Moon },
                  { key: "system", label: "System", Icon: Monitor },
                ] as const).map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => persistTheme(key)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                      theme === key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
