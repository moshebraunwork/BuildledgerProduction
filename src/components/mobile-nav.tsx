"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { can, type PermissionMap } from "@/lib/permissions";
import { NAV } from "@/components/nav-items";
import { HardHat, Menu, X } from "lucide-react";

// Mobile top bar + slide-in drawer. Hidden on md+ where the desktop sidebar
// takes over. Fills the gap where small screens previously had no navigation.
export function MobileNav({
  isSuperadmin, permissions,
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

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
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-primary" />}
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <>
      {/* Top bar (mobile only) */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 md:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
            <HardHat className="h-4 w-4" />
          </div>
          <span className="font-semibold">BuildLedger</span>
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
              <div className="flex h-7 w-7 items-center justify-center rounded bg-primary text-primary-foreground">
                <HardHat className="h-4 w-4" />
              </div>
              <span className="font-semibold">BuildLedger</span>
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
        </div>
      </div>
    </>
  );
}
