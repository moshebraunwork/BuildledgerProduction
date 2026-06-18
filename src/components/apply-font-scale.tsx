"use client";
import * as React from "react";

// Applies the user's saved font size by scaling the root font-size (the whole
// UI is built in rem, so this scales everything consistently). Desktop and
// mobile have independent settings, chosen by the current viewport width.
const SIZES: Record<string, string> = { sm: "15px", md: "16px", lg: "18px", xl: "20px" };

export function ApplyFontScale({ desktop, mobile }: { desktop: string; mobile: string }) {
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => {
      const key = mq.matches ? desktop : mobile;
      document.documentElement.style.fontSize = SIZES[key] ?? "16px";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      document.documentElement.style.fontSize = "";
    };
  }, [desktop, mobile]);
  return null;
}
