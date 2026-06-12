"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Sends phone-sized screens somewhere else. Used by desktop-only pages
// (e.g. the dashboard) whose mobile home is the jobs list instead.
export function MobileRedirect({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) router.replace(to);
  }, [router, to]);
  return null;
}
