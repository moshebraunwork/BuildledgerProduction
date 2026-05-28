"use client";
import * as React from "react";
import { useTheme } from "next-themes";

// Applies the user's saved theme preference from their DB profile, but ONLY
// once per browser session and ONLY if next-themes hasn't already got a stored
// preference. Otherwise this would fight the user every time they switch theme
// in settings (the bug: switching to light reverted instantly).
export function ApplyTheme({ theme }: { theme: string }) {
  const { setTheme } = useTheme();
  const applied = React.useRef(false);

  React.useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    // next-themes stores the user's last choice under the "theme" key.
    // If the browser already has a preference, respect it (the user set it here).
    // Only seed from the DB profile when there's nothing stored yet.
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    if (!stored && theme) {
      setTheme(theme);
    }
  }, [theme, setTheme]);

  return null;
}
