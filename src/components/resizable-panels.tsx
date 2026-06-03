"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// A lightweight horizontal split layout with draggable handles between panels.
// On wide screens the panels sit side-by-side and can be resized by dragging the
// grip between them; on narrow screens they stack vertically (no handles).
// Sizes are stored as percentages and optionally persisted to localStorage.
export function ResizablePanels({
  children,
  storageKey,
  minPercent = 12,
  className,
  panelClassName,
}: {
  children: React.ReactNode;
  storageKey?: string;
  minPercent?: number;
  className?: string;
  panelClassName?: string;
}) {
  const panels = React.Children.toArray(children).filter(Boolean);
  const n = panels.length;

  // Each separator between panels occupies a fixed width (w-1.5 = 6px plus
  // mx-1.5 = 12px = 18px). The panel sizes sum to 100%, so without accounting
  // for the separators the row would be 100% + (n-1)·18px wide and overflow its
  // container — clipping the last panel. Subtract the separators' total width,
  // shared evenly, from each panel's flex-basis so everything fits exactly.
  const SEPARATOR_PX = 18;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [sizes, setSizes] = React.useState<number[]>(() => Array(n).fill(100 / n));
  const [wide, setWide] = React.useState(false);
  const dragRef = React.useRef<{ index: number; startX: number; startSizes: number[]; width: number } | null>(null);

  // only enable side-by-side + resizing once there's room for it
  React.useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);

  // restore persisted sizes (must match current panel count)
  React.useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed) && parsed.length === n) setSizes(parsed);
      else setSizes(Array(n).fill(100 / n));
    } catch {
      /* ignore */
    }
  }, [storageKey, n]);

  const persist = React.useCallback(
    (s: number[]) => {
      if (!storageKey) return;
      try {
        localStorage.setItem(storageKey, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const onMove = React.useCallback(
    (clientX: number) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaPct = ((clientX - d.startX) / d.width) * 100;
      const left = d.index;
      const right = d.index + 1;
      let leftSize = d.startSizes[left] + deltaPct;
      let rightSize = d.startSizes[right] - deltaPct;
      if (leftSize < minPercent) {
        rightSize -= minPercent - leftSize;
        leftSize = minPercent;
      }
      if (rightSize < minPercent) {
        leftSize -= minPercent - rightSize;
        rightSize = minPercent;
      }
      const next = [...d.startSizes];
      next[left] = leftSize;
      next[right] = rightSize;
      setSizes(next);
    },
    [minPercent]
  );

  React.useEffect(() => {
    const onMouseMove = (e: MouseEvent) => onMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => e.touches[0] && onMove(e.touches[0].clientX);
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSizes((s) => {
        persist(s);
        return s;
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [onMove, persist]);

  function startDrag(index: number, clientX: number) {
    const width = containerRef.current?.getBoundingClientRect().width ?? 1;
    dragRef.current = { index, startX: clientX, startSizes: [...sizes], width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  const sepAllowance = wide && n > 1 ? ((n - 1) * SEPARATOR_PX) / n : 0;

  return (
    <div ref={containerRef} className={cn("flex flex-col gap-4 lg:flex-row lg:gap-0", className)}>
      {panels.map((panel, i) => (
        <React.Fragment key={i}>
          <div
            className={cn("min-w-0", panelClassName)}
            style={wide ? { flexBasis: `calc(${sizes[i]}% - ${sepAllowance}px)`, flexGrow: 0, flexShrink: 0 } : undefined}
          >
            {panel}
          </div>
          {wide && i < n - 1 && (
            <div
              role="separator"
              aria-orientation="vertical"
              onMouseDown={(e) => {
                e.preventDefault();
                startDrag(i, e.clientX);
              }}
              onTouchStart={(e) => e.touches[0] && startDrag(i, e.touches[0].clientX)}
              className="group relative mx-1.5 flex w-1.5 shrink-0 cursor-col-resize items-center justify-center rounded-full bg-border transition-colors hover:bg-primary/50"
              title="Drag to resize"
            >
              <span className="pointer-events-none absolute flex flex-col gap-0.5">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50 group-hover:bg-primary" />
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50 group-hover:bg-primary" />
                <span className="h-1 w-1 rounded-full bg-muted-foreground/50 group-hover:bg-primary" />
              </span>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
