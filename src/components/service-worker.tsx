"use client";
import * as React from "react";

// Registers the PWA service worker (only in production builds — registering it
// against the dev server fights HMR and caches stale chunks). The worker gives
// BuildLedger an installable app shell and a friendly offline fallback page.
export function ServiceWorker() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration is best-effort: the app works fine without it.
      });
    };

    // Wait until the page is loaded so the SW install doesn't compete with
    // first paint.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
