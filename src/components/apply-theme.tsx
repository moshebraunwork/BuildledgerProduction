"use client";
import * as React from "react";
import { useTheme } from "next-themes";

// Applies the user's saved theme preference (from their profile) once on mount.
export function ApplyTheme({ theme }: { theme: string }) {
  const { setTheme } = useTheme();
  React.useEffect(() => {
    if (theme) setTheme(theme);
  }, [theme, setTheme]);
  return null;
}
