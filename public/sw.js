/* BuildLedger service worker.
 *
 * Deliberately conservative for a multi-tenant, auth-gated app:
 *   - Static, content-hashed assets (/_next/static, /icons) are cache-first.
 *   - Navigations are network-first and fall back to a generic /offline page
 *     ONLY when the network is unavailable — pages are never persisted, so one
 *     user can never be served another user's cached screen.
 *   - API requests are never touched (always go to the network).
 *
 * Bump CACHE_VERSION to retire old caches on deploy.
 */
const CACHE_VERSION = "bl-static-v1";
const OFFLINE_URL = "/offline";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never intercept API / auth / webhook traffic.
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for immutable, hashed static assets.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Network-first for page navigations; offline fallback when there's no network.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    );
  }
});
