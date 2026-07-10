/**
 * Single source of truth for the app version.
 *
 * Bump this on every release. Used by:
 *   - Settings tab (display)
 *   - Service worker (cache invalidation)
 *   - PWA manifest (version tracking)
 *   - IndexedDB seed version (data migrations)
 *
 * Format: semantic version (MAJOR.MINOR.PATCH).
 */

export const APP_VERSION = "0.3.0";

/** Full version string for display. */
export const APP_VERSION_DISPLAY = `v${APP_VERSION}`;

/** Build date — injected at build time, falls back to dev timestamp. */
export const BUILD_DATE =
  process.env.BUILD_DATE ??
  (process.env.NODE_ENV === "development" ? "dev" : new Date().toISOString().split("T")[0]);
