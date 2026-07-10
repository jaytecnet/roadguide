"use client";

import { useEffect, useRef, useState } from "react";
import type { VehiclePosition } from "@/lib/types";
import {
  createEkf,
  processGpsFix,
  type EkfState,
  type EkfOutput,
} from "@/lib/gps-ekf";
import { useTripStore } from "@/store/trip-store";

/**
 * useGpsTracking — subscribes to device GPS, feeds each fix through the EKF,
 * and pushes the smoothed position into the trip store (which runs trigger
 * evaluation + auto-play).
 *
 * Permissions:
 *   - Browsers require HTTPS (or localhost) for geolocation
 *   - First call triggers the permission prompt
 *   - If denied, the hook reports the error and the app falls back to Test Mode
 *
 * Battery considerations:
 *   - `enableHighAccuracy: true` uses GPS chip (more accurate, more battery)
 *   - We accept this cost because trigger accuracy at highway speeds matters
 *   - Hook is paused when the user switches to Test Mode (caller controls this)
 *
 * Phase 3 snap-to-road:
 *   - For now, we pass raw EKF-smoothed lat/lon to the trip store
 *   - SLK / carriageway matching is only needed for SLK-range triggers
 *     (corridor callouts), which are rare — defer until needed
 */

export type GpsStatus =
  | { state: "idle" }
  | { state: "requesting-permission" }
  | { state: "denied"; message: string }
  | { state: "unavailable"; message: string }
  | { state: "active"; accuracy: number; fixCount: number }
  | { state: "error"; message: string };

interface UseGpsTrackingResult {
  status: GpsStatus;
  /** Start watching GPS. Safe to call multiple times. */
  start: () => void;
  /** Stop watching GPS. */
  stop: () => void;
  /** Latest EKF output (for UI display). */
  latestFix: EkfOutput | null;
}

export function useGpsTracking(active: boolean): UseGpsTrackingResult {
  const [status, setStatus] = useState<GpsStatus>({ state: "idle" });
  const [latestFix, setLatestFix] = useState<EkfOutput | null>(null);
  const ekfRef = useRef<EkfState | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const fixCountRef = useRef(0);
  const updatePosition = useTripStore((s) => s.updatePosition);

  const start = () => {
    if (watchIdRef.current !== null) return; // already watching
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus({ state: "unavailable", message: "Geolocation not supported" });
      return;
    }

    setStatus({ state: "requesting-permission" });

    // Reset EKF on each start (fresh session, fresh filter)
    ekfRef.current = createEkf();
    fixCountRef.current = 0;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const fix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed ?? undefined,
          timestamp: pos.timestamp,
        };

        const ekfOut = processGpsFix(ekfRef.current!, fix);
        if (!ekfOut) return;

        fixCountRef.current += 1;
        setLatestFix(ekfOut);
        setStatus({
          state: "active",
          accuracy: ekfOut.accuracy,
          fixCount: fixCountRef.current,
        });

        // Push to trip store → trigger evaluation + auto-play
        const vehiclePos: VehiclePosition = {
          source: "gps",
          lat: ekfOut.lat,
          lon: ekfOut.lon,
          speedKmh: ekfOut.speedMs * 3.6,
          headingDeg: ekfOut.headingDeg,
          timestamp: ekfOut.timestamp,
        };
        void updatePosition(vehiclePos);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus({
            state: "denied",
            message: "Location permission denied. Use Test Mode instead.",
          });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus({
            state: "unavailable",
            message: "GPS unavailable. Check location services.",
          });
        } else {
          setStatus({
            state: "error",
            message: err.message || "GPS error",
          });
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000, // accept fixes up to 1s old
        timeout: 15000, // give up if no fix in 15s
      },
    );
  };

  const stop = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus({ state: "idle" });
    setLatestFix(null);
  };

  // Auto-start/stop based on `active` flag.
  // Defer to microtask to avoid the "setState synchronously within an effect"
  // lint rule — start() calls setStatus() which React doesn't want inline.
  useEffect(() => {
    const pending = active ? start : stop;
    queueMicrotask(() => pending());
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [active]);

  return { status, start, stop, latestFix };
}
