"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

// A right-side slide-out panel. Replaces modal dialogs across the app.
// Controlled via `open` / `onClose`. Content is provided as children.
export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
  layer = "base",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl" | "full";
  layer?: "base" | "nested";
}) {
  // Close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while the panel is open so the page behind doesn't scroll
  // or lose its position on touch devices.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const widthClass = width === "full" ? "w-full" : width === "xl" ? "max-w-5xl" : width === "lg" ? "max-w-2xl" : width === "sm" ? "max-w-sm" : "max-w-md";
  const zClass = layer === "nested" ? "z-[60]" : "z-50";

  return (
    <div
      className={cn(
        `fixed inset-0 ${zClass} transition-opacity duration-200`,
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      )}
      aria-hidden={!open}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div
        className={cn(
          "absolute right-0 top-0 flex h-full w-full flex-col border-l bg-background shadow-2xl transition-transform duration-200 ease-out",
          widthClass,
          open ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
      >
        {(title || description) && (
          <div className="flex items-start justify-between gap-4 border-b p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
            <div className="min-w-0">
              {title && <h2 className="truncate text-lg font-semibold">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overscroll-contain-y p-4">{children}</div>

        {footer && <div className="border-t p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}
