"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on mount. No-op during SSR.
 *
 * In development, SW registration is skipped by default to avoid caching
 * stale dev assets. Set NEXT_PUBLIC_SW_DEV=1 to enable in dev.
 */
export function RegisterSw() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Skip in dev unless explicitly enabled
    const isDev = process.env.NODE_ENV === "development";
    const enableInDev = process.env.NEXT_PUBLIC_SW_DEV === "1";
    if (isDev && !enableInDev) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        // Listen for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New version available — could surface a toast here
              console.info("[SW] New version available, will activate on reload");
            }
          });
        });
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    };

    void register();
  }, []);

  return null;
}
