"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker on mount. No-op during SSR.
 *
 * In development, SW registration is skipped by default to avoid caching
 * stale dev assets. Set NEXT_PUBLIC_SW_DEV=1 to enable in dev.
 *
 * Also listens for SW_ACTIVATED messages from the service worker — when a
 * new version activates, prompt the user to reload (or auto-reload if no
 * audio is playing, to avoid interrupting playback).
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
              // New version downloaded — will activate on next reload.
              // The SW_ACTIVATED message handler below will prompt reload.
              console.info("[SW] New version downloaded, will activate on reload");
            }
          });
        });
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    };

    void register();

    // Listen for SW_ACTIVATED messages — reload to pick up new app shell
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_ACTIVATED") {
        // Check if audio is currently playing — don't interrupt playback
        const audio = document.querySelector("audio");
        const isPlaying = audio && !audio.paused && !audio.ended;
        if (isPlaying) {
          toast.info("App updated", {
            description: "Reload to get the latest version.",
            duration: 8000,
          });
        } else {
          // Safe to reload immediately
          window.location.reload();
        }
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, []);

  return null;
}
