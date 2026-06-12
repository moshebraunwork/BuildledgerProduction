"use client";

import * as React from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// Chat-style mobile list. Replaces the bordered MobileCard pattern: full-bleed
// tappable rows (title + meta on the first line, subtitle + trailing on the
// second), shared by jobs, invoices, team, inventory and the lists inside a job.
// `MobileList` bleeds through the page's 1rem padding; render it under `md` only.

export function MobileList({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("-mx-4 md:hidden", className)}>{children}</div>;
}

export function MobileListRow({
  onClick, onContextMenu, title, meta, subtitle, trailing, actions, className,
}: {
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title: React.ReactNode;
  meta?: React.ReactNode;       // small text on the right of the title (e.g. a date)
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;   // right of the subtitle (status dot, badge, amount)
  actions?: React.ReactNode;    // e.g. a ⋮ menu button
  className?: string;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick?.(); }}
      onContextMenu={onContextMenu}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3.5 transition-colors",
        onClick && "cursor-pointer active:bg-accent",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[15px] font-semibold">{title}</p>
          {meta != null && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
        </div>
        {(subtitle != null || trailing != null) && (
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm text-muted-foreground">{subtitle}</p>
            {trailing != null && <span className="shrink-0">{trailing}</span>}
          </div>
        )}
      </div>
      {actions}
    </div>
  );
}

// The ⋮ button used at the end of a row. Stops propagation so the row's own
// onClick doesn't also fire.
export function MobileRowMenu({ onOpen, label = "More options" }: { onOpen: (e: React.MouseEvent) => void; label?: string }) {
  return (
    <button
      type="button"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-accent"
      onClick={(e) => { e.stopPropagation(); onOpen(e); }}
      aria-label={label}
    >
      <MoreVertical className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}
