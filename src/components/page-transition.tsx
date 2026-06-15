"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

// Mobile-only page transition. On every route change the incoming page is
// remounted (keyed on pathname) and replays a CSS reveal: it emerges as a
// rounded card rising from the bottom (where the thumb / tab bar sit), scaling
// and un-blurring into place, with a brief on-brand indigo glow sweeping up
// from below. Desktop is unaffected and `prefers-reduced-motion` falls back to
// a plain fade — all handled in globals.css so this component stays tiny.
//
// The outer wrapper uses `display: contents` so it adds no box of its own; the
// glow lives OUTSIDE the transformed element (a transform would otherwise trap
// its `position: fixed` and the clip-path would crop it).
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="contents">
      <span aria-hidden className="page-enter-glow" />
      <div className="page-transition-enter">{children}</div>
    </div>
  );
}
