"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { can, type PermissionMap } from "@/lib/permissions";
import { saveTheme } from "@/app/(app)/actions";
import { NAV } from "@/components/nav-items";
import { cn } from "@/lib/utils";
import {
  Search, CornerDownLeft, Plus, Moon, Sun, Monitor, ArrowUp, ArrowDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Command palette (⌘K) + global keyboard shortcuts.
// A single overlay, mounted once at the app shell, that fuzzy-searches across
// navigation, "create" actions and settings — mirroring the Workstock
// prototype. Any component can open it via `useCommandPalette().open()`.
// Shortcuts: ⌘K / Ctrl+K toggles · N new job · D dark-mode · G then J/D/E/I/C/S/V
// jump between views · ↑↓ navigate · ↵ run · Esc close.
// ---------------------------------------------------------------------------

type Section = "Navigate" | "Create" | "Settings";

interface Command {
  id: string;
  label: string;
  section: Section;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  run: () => void;
}

interface Ctx {
  open: () => void;
  close: () => void;
  toggle: () => void;
  isOpen: boolean;
}

const PaletteContext = React.createContext<Ctx | null>(null);

export function useCommandPalette(): Ctx {
  const ctx = React.useContext(PaletteContext);
  if (!ctx) {
    // A no-op fallback keeps consumers safe if rendered outside the provider.
    return { open: () => {}, close: () => {}, toggle: () => {}, isOpen: false };
  }
  return ctx;
}

export function CommandPaletteProvider({
  isSuperadmin,
  permissions,
  children,
}: {
  isSuperadmin: boolean;
  permissions: PermissionMap;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const allow = React.useCallback(
    (perm: string) => perm === "" || can(isSuperadmin, permissions, perm),
    [isSuperadmin, permissions]
  );

  const open = React.useCallback(() => { setQuery(""); setActive(0); setIsOpen(true); }, []);
  const close = React.useCallback(() => setIsOpen(false), []);
  const toggle = React.useCallback(() => setIsOpen((o) => !o), []);

  async function applyTheme(theme: string) {
    setTheme(theme);
    try { await saveTheme(theme); } catch { /* non-critical */ }
  }

  // Build the command catalog from the live nav (permission-filtered).
  const commands = React.useMemo<Command[]>(() => {
    const out: Command[] = [];
    const pushNav = (items: typeof NAV) => {
      for (const n of items) {
        if (!allow(n.perm)) continue;
        if (n.children && n.children.length > 0) {
          pushNav(n.children);
          continue;
        }
        out.push({
          id: `nav:${n.href}`,
          label: `Go to ${n.label}`,
          section: "Navigate",
          icon: n.icon,
          keywords: n.label,
          run: () => router.push(n.href),
        });
      }
    };
    pushNav(NAV);

    if (allow("jobs.edit"))
      out.push({ id: "new:job", label: "New job", section: "Create", icon: Plus, keywords: "create add", run: () => router.push("/jobs?new=1") });
    if (allow("inventory.edit"))
      out.push({ id: "new:item", label: "New inventory item", section: "Create", icon: Plus, keywords: "create add sku part", run: () => router.push("/inventory?new=1") });
    if (allow("employees.edit"))
      out.push({ id: "new:emp", label: "Invite team member", section: "Create", icon: Plus, keywords: "create add employee invite", run: () => router.push("/employees?new=1") });

    out.push({ id: "theme:light", label: "Switch to light mode", section: "Settings", icon: Sun, keywords: "theme appearance", run: () => applyTheme("light") });
    out.push({ id: "theme:dark", label: "Switch to dark mode", section: "Settings", icon: Moon, keywords: "theme appearance", run: () => applyTheme("dark") });
    out.push({ id: "theme:system", label: "Use system theme", section: "Settings", icon: Monitor, keywords: "theme appearance auto", run: () => applyTheme("system") });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allow, router]);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.keywords ?? ""} ${c.section}`.toLowerCase().includes(q)
    );
  }, [commands, query]);

  React.useEffect(() => { setActive(0); }, [query]);

  // Focus the input when the palette opens.
  React.useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  // Keep the active row in view.
  React.useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function runIndex(i: number) {
    const cmd = results[i];
    if (!cmd) return;
    setIsOpen(false);
    cmd.run();
  }

  // Global key handling: palette toggle everywhere, plus single-key shortcuts
  // when the user isn't typing into a field.
  React.useEffect(() => {
    let gPending = false;
    let gTimer: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      const editable = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (e.target as HTMLElement | null)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
        return;
      }

      if (isOpen) {
        if (e.key === "Escape") { e.preventDefault(); setIsOpen(false); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
        else if (e.key === "Enter") { e.preventDefault(); runIndex(active); }
        return;
      }

      if (editable || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();

      if (gPending) {
        gPending = false;
        if (gTimer) clearTimeout(gTimer);
        const map: Record<string, string> = {
          d: "/dashboard", j: "/jobs", s: "/schedule", e: "/employees",
          i: "/inventory", c: "/customers", v: "/invoices",
        };
        if (map[k]) { e.preventDefault(); router.push(map[k]); }
        return;
      }

      if (k === "g") { gPending = true; gTimer = setTimeout(() => { gPending = false; }, 800); }
      else if (k === "n") { e.preventDefault(); open(); setQuery("new"); }
      else if (k === "d") {
        e.preventDefault();
        // Toggle between light/dark from the resolved document state.
        const isDark = document.documentElement.classList.contains("dark");
        applyTheme(isDark ? "light" : "dark");
      }
    };

    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); if (gTimer) clearTimeout(gTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, results, active, toggle, open, router]);

  // Group results by section for display while keeping a flat index for nav.
  let flatIndex = -1;
  const sections: Section[] = ["Navigate", "Create", "Settings"];

  return (
    <PaletteContext.Provider value={{ open, close, toggle, isOpen }}>
      {children}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-4 pt-[14vh] backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="ws-fade w-full max-w-[560px] overflow-hidden rounded-2xl border bg-popover shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
          >
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command, search jobs, customers…"
                className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              />
              <kbd className="rounded border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
            </div>

            <div ref={listRef} className="max-h-[340px] overflow-y-auto p-2">
              {results.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">No results for “{query}”.</p>
              )}
              {sections.map((section) => {
                const items = results.filter((r) => r.section === section);
                if (items.length === 0) return null;
                return (
                  <div key={section} className="mb-1">
                    <p className="px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{section}</p>
                    {items.map((cmd) => {
                      flatIndex += 1;
                      const idx = flatIndex;
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.id}
                          data-idx={idx}
                          type="button"
                          onMouseMove={() => setActive(idx)}
                          onClick={() => runIndex(idx)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                            active === idx ? "bg-accent text-accent-foreground" : "text-foreground"
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">{cmd.label}</span>
                          {active === idx && <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 font-mono text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><ArrowUp className="h-3 w-3" /><ArrowDown className="h-3 w-3" /> navigate</span>
              <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> select</span>
              <span>esc close</span>
            </div>
          </div>
        </div>
      )}
    </PaletteContext.Provider>
  );
}
