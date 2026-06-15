import type { MetadataRoute } from "next";

// Served by Next.js at /manifest.webmanifest. Makes BuildLedger installable as
// a PWA so crews can launch it from a phone home screen like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BuildLedger",
    short_name: "BuildLedger",
    description: "Construction job, inventory & invoicing management",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
