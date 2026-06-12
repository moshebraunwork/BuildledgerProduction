"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The app scrolls inside <main> (a custom overflow container), and Next.js only
// resets *window* scroll on navigation — so without this, opening a detail page
// from a scrolled list keeps the old scroll offset and the top is cut off.
export function ScrollReset({ targetId }: { targetId: string }) {
  const pathname = usePathname();
  useEffect(() => {
    document.getElementById(targetId)?.scrollTo(0, 0);
  }, [pathname, targetId]);
  return null;
}
