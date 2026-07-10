/**
 * Service worker for the Wheatbelt Audio Companion.
 *
 * Responsibilities:
 *   1. Pre-cache the app shell on install (HTML, JS, CSS, icons, manifest)
 *   2. Serve app shell from cache when offline (network-first for HTML,
 *      cache-first for static assets)
 *   3. Pass-through for audio blobs (served via object URLs from IndexedDB,
 *      never hits the network in normal use)
 *   4. Background-audio keepalive — Android Chrome will keep audio playing
 *      with screen off as long as Media Session is active and the SW is alive
 *
 * The SW does NOT cache:
 *   - IndexedDB blobs (these are served via blob: URLs, never fetched)
 *   - The /api/tts route (only used for content generation, not playback)
 *   - MRWA ArcGIS requests (Phase 3 will add a separate cache for road geometry)
 */

const VERSION = "v0.4.0";
const APP_SHELL_CACHE = `wheatbelt-shell-${VERSION}`;
const RUNTIME_CACHE = `wheatbelt-runtime-${VERSION}`;

const APP_SHELL_ASSETS = [
  "/",
  "/manifest.json",
  "/icon-96.png",
  "/icon-128.png",
  "/icon-192.png",
  "/icon-256.png",
  "/icon-384.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-32.png",
  "/icon.svg",
];

// Install — pre-cache app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// Activate — clean up old caches + notify clients to reload
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all open clients that a new SW has activated — they should reload
        return self.clients.matchAll({ type: "window" });
      })
      .then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: "SW_ACTIVATED", version: VERSION });
        });
      }),
  );
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET requests
  if (request.method !== "GET") return;

  // Never intercept audio blob URLs (blob: scheme)
  if (url.protocol === "blob:") return;

  // Skip cross-origin requests (MRWA ArcGIS, etc.) — handle in Phase 3
  if (url.origin !== self.location.origin) return;

  // Skip API routes
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests (HTML pages) — network-first, fall back to cached shell
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  // Static assets — cache-first, fall back to network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Cache successful responses for next time
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

// Message handler — allows the app to trigger updates / cache management
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data === "CLEAR_CACHES") {
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key))),
    );
  }
});
