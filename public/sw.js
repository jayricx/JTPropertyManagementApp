/*
 * JT Property Management — service worker.
 *
 * Deliberately conservative, because this app is auth-gated and serves React
 * Server Component payloads:
 *   - /api/*, auth routes and any non-GET request are never intercepted.
 *   - Navigations are network-first and HTML is never cached, so a stale app
 *     shell can never be served. When the network is gone the user gets the
 *     offline page instead.
 *   - Build assets (/_next/static/…, icons, fonts, images) are cache-first:
 *     their filenames are content-hashed, so they are immutable per build.
 *
 * Bump VERSION on release to drop old caches.
 */
const VERSION = "v1";
const STATIC_CACHE = `jt-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // addAll rejects the whole batch if one file 404s; add individually.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url))))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith("jt-")).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpe?g|svg|webp|avif|ico|woff2?)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API and auth traffic always goes to the network, uncached.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/webpack-hmr")
  ) {
    return;
  }

  // Navigations: network-first, offline page on failure.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(OFFLINE_URL);
        return cached ?? new Response("Offline", { status: 503 });
      }),
    );
    return;
  }

  if (!isStaticAsset(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put(request, copy))
            .catch(() => undefined);
        }
        return response;
      });
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});