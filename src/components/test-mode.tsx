"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, FastForward, RotateCcw, MapPin } from "lucide-react";
import { useTripStore } from "@/store/trip-store";
import { usePlayerStore } from "@/store/player-store";
import { useUiStore } from "@/store/ui-store";
import { ROADS, nearestTown } from "@/lib/wheatbelt-towns";
import type { RoadId, SlkDirection, VehiclePosition } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TICK_MS = 250; // simulation tick interval
const MS_TO_H = 3_600_000;

export function TestMode() {
  const { clips, updatePosition, position, matchedClipIds, playClip } =
    useTripStore();
  const { currentClip, isPlaying } = usePlayerStore();
  const { togglePlay } = usePlayerStore();
  const testModeLive = useUiStore((s) => s.testModeLive);
  const setTestModeLive = useUiStore((s) => s.setTestModeLive);

  const [roadId, setRoadId] = useState<RoadId>("M031");
  const [slk, setSlk] = useState(0);
  const [direction, setDirection] = useState<SlkDirection>("increasing");
  const [speedKmh, setSpeedKmh] = useState(90);

  const road = ROADS[roadId];
  const town = nearestTown(roadId, slk);

  // Live simulation loop — advances SLK based on speed
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!testModeLive) return;

    const tick = (now: number) => {
      if (lastTickRef.current === 0) lastTickRef.current = now;
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      // Compute SLK delta: speed (km/h) * time (h) = distance (km)
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
  }, [testModeLive, slk, direction, speedKmh, road.slkEnd, road.slkStart, setTestModeLive]);

  // Whenever SLK / direction changes, push a position update to the trip store
  // (this drives trigger evaluation + auto-play)
  useEffect(() => {
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
  }, [slk, direction, roadId, town, speedKmh, testModeLive, updatePosition]);

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

  const progressPct = ((slk - road.slkStart) / (road.slkEnd - road.slkStart)) * 100;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h2 className="text-lg font-semibold">Test Mode</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Simulate driving along the road. Slide the SLK bar or hit Live to
          auto-advance. Triggers fire and audio plays just like real GPS mode.
        </p>
      </div>

      {/* Road + position readout */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Current position
          </div>
          <Badge variant="secondary" className="text-[10px]">
            TEST MODE
          </Badge>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-3xl font-bold tabular-nums">
            {slk.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground">km SLK</span>
        </div>
        <div className="text-sm text-muted-foreground mb-3">
          {road.name} · {road.id}
        </div>

        {/* Nearest town */}
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
      </Card>

      {/* SLK slider */}
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

        {/* Town quick-jump buttons */}
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

      {/* Direction + speed + live controls */}
      <Card className="p-5 space-y-4">
        {/* Direction toggle */}
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

        {/* Speed */}
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

        {/* Live controls */}
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

      {/* Clip status list */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Clips &amp; triggers</h3>
          <span className="text-[11px] text-muted-foreground">
            {matchedClipIds.size} active
          </span>
        </div>
        <div className="space-y-1 max-h-96 overflow-y-auto scroll-area-thin">
          {clips.map((clip) => {
            const isMatched = matchedClipIds.has(clip.id);
            const isCurrent = currentClip?.id === clip.id;
            const isPlayingThis = isCurrent && isPlaying;
            return (
              <button
                key={clip.id}
                onClick={() => playClip(clip.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-colors",
                  isCurrent
                    ? "bg-primary/10 ring-1 ring-primary/30"
                    : "hover:bg-muted/50",
                )}
              >
                {/* Status dot */}
                <div className="relative flex-shrink-0">
                  {isPlayingThis && (
                    <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping" />
                  )}
                  <div
                    className={cn(
                      "w-2.5 h-2.5 rounded-full relative",
                      isMatched
                        ? "bg-primary"
                        : isCurrent
                          ? "bg-primary/60"
                          : clip.audioReady
                            ? "bg-muted-foreground/40"
                            : "bg-destructive/40",
                    )}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
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
                {isMatched && !isCurrent && (
                  <Badge variant="secondary" className="text-[10px] flex-shrink-0">
                    Triggered
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Progress hint */}
      <div className="text-[11px] text-muted-foreground px-1 text-center">
        Trip progress: {progressPct.toFixed(0)}% · {slk.toFixed(1)} / {road.slkEnd} km
      </div>
    </div>
  );
}
