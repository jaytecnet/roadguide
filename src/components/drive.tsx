"use client";

import { useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  FastForward,
  RotateCcw,
  MapPin,
  Satellite,
  SlidersHorizontal,
  CheckCircle2,
  Circle,
  AlertTriangle,
} from "lucide-react";
import { useTripStore } from "@/store/trip-store";
import { usePlayerStore } from "@/store/player-store";
import { useUiStore } from "@/store/ui-store";
import { useGpsTracking, type GpsStatus } from "@/hooks/useGpsTracking";
import { ROADS, nearestTown } from "@/lib/wheatbelt-towns";
import type { RoadId, SlkDirection, VehiclePosition } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const TICK_MS = 250;
const MS_TO_H = 3_600_000;

export function Drive() {
  const { clips, updatePosition, position, matchedClipIds, playClip, journey, startNewJourney } =
    useTripStore();
  const { currentClip, isPlaying } = usePlayerStore();
  const driveMode = useUiStore((s) => s.driveMode);
  const setDriveMode = useUiStore((s) => s.setDriveMode);
  const testModeLive = useUiStore((s) => s.testModeLive);
  const setTestModeLive = useUiStore((s) => s.setTestModeLive);

  // Test-mode state
  const [roadId] = useState<RoadId>("M031");
  const [slk, setSlk] = useState(0);
  const [direction, setDirection] = useState<SlkDirection>("increasing");
  const [speedKmh, setSpeedKmh] = useState(90);

  // GPS hook — only active when driveMode === "live"
  const { status: gpsStatus, latestFix } = useGpsTracking(driveMode === "live");

  const road = ROADS[roadId];
  const town = nearestTown(roadId, slk);

  // Live test-mode simulation loop
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!testModeLive || driveMode !== "test") return;

    const tick = (now: number) => {
      if (lastTickRef.current === 0) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      const deltaSlk = (speedKmh * dt) / MS_TO_H;
      let newSlk: number;
      if (direction === "increasing") {
        newSlk = slk + deltaSlk;
        if (newSlk >= road.slkEnd) {
          newSlk = road.slkEnd;
          setTestModeLive(false);
        }
      } else {
        newSlk = slk - deltaSlk;
        if (newSlk <= road.slkStart) {
          newSlk = road.slkStart;
          setTestModeLive(false);
        }
      }
      setSlk(newSlk);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTickRef.current = 0;
    };
  }, [testModeLive, driveMode, slk, direction, speedKmh, road.slkEnd, road.slkStart, setTestModeLive]);

  // Push test-mode position to trip store
  useEffect(() => {
    if (driveMode !== "test") return;
    const pos: VehiclePosition = {
      source: "test",
      roadId,
      slk,
      direction,
      lat: town?.lat,
      lon: town?.lon,
      speedKmh: testModeLive ? speedKmh : 0,
      timestamp: Date.now(),
    };
    void updatePosition(pos);
  }, [slk, direction, roadId, town, speedKmh, testModeLive, driveMode, updatePosition]);

  const handleSlkChange = (value: number[]) => {
    setTestModeLive(false);
    setSlk(value[0]);
  };

  const handleReset = () => {
    setTestModeLive(false);
    setSlk(road.slkStart);
    setDirection("increasing");
  };

  const handleJumpToTown = (townSlk: number) => {
    setTestModeLive(false);
    setSlk(townSlk);
  };

  const handleToggleLive = () => {
    if (!testModeLive && slk >= road.slkEnd && direction === "increasing") {
      setSlk(road.slkStart);
    }
    if (!testModeLive && slk <= road.slkStart && direction === "decreasing") {
      setSlk(road.slkEnd);
    }
    setTestModeLive(!testModeLive);
  };

  const playedSet = new Set(journey?.playedClipIds ?? []);
  const progressPct = ((slk - road.slkStart) / (road.slkEnd - road.slkStart)) * 100;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h2 className="text-lg font-semibold">Drive</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Test Mode simulates driving with the SLK slider. Live Mode uses real GPS.
          Triggers fire and audio plays in both modes.
        </p>
      </div>

      {/* Mode toggle */}
      <Card className="p-2">
        <div className="grid grid-cols-2 gap-1">
          <button
            onClick={() => setDriveMode("test")}
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors",
              driveMode === "test"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Test Mode
          </button>
          <button
            onClick={() => setDriveMode("live")}
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 rounded-md text-sm font-medium transition-colors",
              driveMode === "live"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Satellite className="w-4 h-4" />
            Live GPS
          </button>
        </div>
      </Card>

      {/* GPS status (Live mode only) */}
      {driveMode === "live" && (
        <GpsStatusCard status={gpsStatus} fix={latestFix} />
      )}

      {/* Position readout */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Current position
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {driveMode === "live" ? "LIVE GPS" : "TEST MODE"}
          </Badge>
        </div>
        {driveMode === "test" ? (
          <>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-bold tabular-nums">
                {slk.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground">km SLK</span>
            </div>
            <div className="text-sm text-muted-foreground mb-3">
              {road.name} · {road.id}
            </div>
            {town && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{town.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {town.lat.toFixed(4)}°, {town.lon.toFixed(4)}°
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  Δ {Math.abs(slk - town.slk).toFixed(1)} km
                </div>
              </div>
            )}
          </>
        ) : (
          <LivePositionReadout status={gpsStatus} fix={latestFix} />
        )}
      </Card>

      {/* Test-mode controls (hidden in live mode) */}
      {driveMode === "test" && (
        <>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">SLK position</label>
              <span className="text-xs text-muted-foreground font-mono">
                {road.slkStart} – {road.slkEnd} km
              </span>
            </div>
            <Slider
              value={[slk]}
              min={road.slkStart}
              max={road.slkEnd}
              step={0.1}
              onValueChange={handleSlkChange}
              className="mb-2"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono mb-3">
              <span>{road.slkStart}</span>
              <span>{road.slkEnd}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {road.towns.map((t) => (
                <button
                  key={t.slk}
                  onClick={() => handleJumpToTown(t.slk)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
                    town?.slk === t.slk
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5 space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">
                Direction of travel
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDirection("increasing")}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    direction === "increasing"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30",
                  )}
                >
                  <div className="text-sm font-semibold">Increasing</div>
                  <div className="text-[11px] text-muted-foreground">
                    True Left carriageway
                  </div>
                </button>
                <button
                  onClick={() => setDirection("decreasing")}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-colors",
                    direction === "decreasing"
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30",
                  )}
                >
                  <div className="text-sm font-semibold">Decreasing</div>
                  <div className="text-[11px] text-muted-foreground">
                    True Right carriageway
                  </div>
                </button>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Simulated speed</label>
                <span className="text-sm font-mono text-primary">
                  {speedKmh} km/h
                </span>
              </div>
              <Slider
                value={[speedKmh]}
                min={40}
                max={120}
                step={5}
                onValueChange={(v) => setSpeedKmh(v[0])}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleToggleLive}
                className="flex-1"
                variant={testModeLive ? "destructive" : "default"}
              >
                {testModeLive ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" />
                    Pause simulation
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start driving
                  </>
                )}
              </Button>
              <Button onClick={handleReset} variant="outline" size="icon">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
            {testModeLive && (
              <div className="text-[11px] text-muted-foreground text-center">
                <FastForward className="w-3 h-3 inline mr-1" />
                Auto-advancing at {speedKmh} km/h ({direction})
              </div>
            )}
          </Card>
        </>
      )}

      {/* Journey controls */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Journey</h3>
          {journey && (
            <span className="text-[11px] text-muted-foreground">
              {playedSet.size} / {clips.length} played
            </span>
          )}
        </div>
        <Button
          onClick={startNewJourney}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Start new journey (reset all played)
        </Button>
        <p className="text-[11px] text-muted-foreground mt-2">
          Clips that have played to completion or been skipped won&apos;t re-fire
          until you start a new journey.
        </p>
      </Card>

      {/* Clip status list */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Clips &amp; triggers</h3>
          <span className="text-[11px] text-muted-foreground">
            {matchedClipIds.size} active · {playedSet.size} done
          </span>
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto scroll-area-thin">
          {clips.map((clip) => {
            const isMatched = matchedClipIds.has(clip.id);
            const isCurrent = currentClip?.id === clip.id;
            const isPlayingThis = isCurrent && isPlaying;
            const isPlayed = playedSet.has(clip.id);
            return (
              <button
                key={clip.id}
                onClick={() => playClip(clip.id)}
                disabled={isPlayed && !isCurrent}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                  isCurrent
                    ? "bg-primary/10 ring-1 ring-primary/30"
                    : isPlayed
                      ? "opacity-50"
                      : "hover:bg-muted/50",
                )}
              >
                {/* Status icon */}
                <div className="relative flex-shrink-0">
                  {isPlayed ? (
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                  ) : isMatched ? (
                    <>
                      {isPlayingThis && (
                        <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                      )}
                      <div className="w-2.5 h-2.5 rounded-full bg-primary relative" />
                    </>
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground/40" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm font-medium truncate", isPlayed && "line-through")}>
                    {clip.title}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {clip.trigger.type === "slk-range"
                      ? `SLK ${clip.trigger.slkStart}–${clip.trigger.slkEnd} · ${clip.trigger.direction}`
                      : `Geofence ${clip.trigger.radiusM}m`}
                  </div>
                </div>

                {isCurrent && (
                  <Badge variant="default" className="text-[10px] flex-shrink-0">
                    {isPlaying ? "Playing" : "Loaded"}
                  </Badge>
                )}
                {isMatched && !isCurrent && !isPlayed && (
                  <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                    Triggered
                  </Badge>
                )}
                {isPlayed && !isCurrent && (
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">
                    Done
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Progress hint (test mode only) */}
      {driveMode === "test" && (
        <div className="text-[11px] text-muted-foreground px-1 text-center">
          Trip progress: {progressPct.toFixed(0)}% · {slk.toFixed(1)} / {road.slkEnd} km
        </div>
      )}
    </div>
  );
}

function GpsStatusCard({
  status,
  fix,
}: {
  status: GpsStatus;
  fix: { lat: number; lon: number; accuracy: number; speedMs: number; headingDeg: number } | null;
}) {
  let color = "text-muted-foreground";
  let bg = "bg-muted/30";
  let label = "Idle";
  let detail = "";
  let icon = <Satellite className="w-4 h-4" />;

  switch (status.state) {
    case "idle":
      label = "Idle";
      detail = "GPS not started";
      break;
    case "requesting-permission":
      label = "Requesting permission";
      detail = "Please allow location access";
      bg = "bg-primary/10";
      color = "text-primary";
      break;
    case "denied":
      label = "Permission denied";
      detail = status.message;
      bg = "bg-destructive/10";
      color = "text-destructive";
      icon = <AlertTriangle className="w-4 h-4" />;
      break;
    case "unavailable":
      label = "GPS unavailable";
      detail = status.message;
      bg = "bg-destructive/10";
      color = "text-destructive";
      icon = <AlertTriangle className="w-4 h-4" />;
      break;
    case "error":
      label = "GPS error";
      detail = status.message;
      bg = "bg-destructive/10";
      color = "text-destructive";
      icon = <AlertTriangle className="w-4 h-4" />;
      break;
    case "active":
      label = "GPS active";
      detail = `±${status.accuracy.toFixed(0)}m · ${status.fixCount} fixes`;
      bg = "bg-primary/10";
      color = "text-primary";
      break;
  }

  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-lg", bg, color)}>
      {icon}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {detail && <div className="text-[11px] opacity-80">{detail}</div>}
      </div>
      {fix && status.state === "active" && (
        <div className="text-right text-[11px] font-mono">
          <div>{fix.speedMs * 3.6 < 1 ? "—" : `${(fix.speedMs * 3.6).toFixed(0)} km/h`}</div>
          <div className="opacity-70">
            {Number.isNaN(fix.headingDeg) ? "—" : `${fix.headingDeg.toFixed(0)}°`}
          </div>
        </div>
      )}
    </div>
  );
}

function LivePositionReadout({
  status,
  fix,
}: {
  status: GpsStatus;
  fix: { lat: number; lon: number; accuracy: number; speedMs: number; headingDeg: number } | null;
}) {
  if (status.state !== "active" || !fix) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        {status.state === "idle"
          ? "Waiting for GPS fix..."
          : status.state === "requesting-permission"
            ? "Please allow location access"
            : "GPS not active"}
      </div>
    );
  }
  return (
    <>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-lg font-bold tabular-nums">
          {fix.lat.toFixed(5)}°
        </span>
        <span className="text-sm text-muted-foreground">lat</span>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-lg font-bold tabular-nums">
          {fix.lon.toFixed(5)}°
        </span>
        <span className="text-sm text-muted-foreground">lon</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-md bg-muted/50">
          <div className="text-[10px] uppercase text-muted-foreground">Speed</div>
          <div className="text-sm font-mono">
            {fix.speedMs * 3.6 < 1 ? "—" : `${(fix.speedMs * 3.6).toFixed(0)} km/h`}
          </div>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <div className="text-[10px] uppercase text-muted-foreground">Heading</div>
          <div className="text-sm font-mono">
            {Number.isNaN(fix.headingDeg) ? "—" : `${fix.headingDeg.toFixed(0)}°`}
          </div>
        </div>
        <div className="p-2 rounded-md bg-muted/50">
          <div className="text-[10px] uppercase text-muted-foreground">Accuracy</div>
          <div className="text-sm font-mono">±{fix.accuracy.toFixed(0)}m</div>
        </div>
      </div>
    </>
  );
}
