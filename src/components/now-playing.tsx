"use client";

import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useState } from "react";
import { usePlayerStore } from "@/store/player-store";
import { useTripStore } from "@/store/trip-store";
import { useUiStore } from "@/store/ui-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function formatTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function NowPlaying() {
  const {
    currentClip,
    isPlaying,
    positionSec,
    durationSec,
    isMuted,
    error,
    queue,
  } = usePlayerStore();
  const { togglePlay, skipForward, skipBackward, toggleMute, seek } =
    usePlayerStore();
  const { clips, matchedClipIds } = useTripStore();
  const { playClip, skipClip } = useTripStore();
  const expandedClipId = useUiStore((s) => s.expandedClipId);
  const setExpandedClip = useUiStore((s) => s.setExpandedClip);
  const [expanded, setExpanded] = useState(false);

  // Empty state — nothing playing
  if (!currentClip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Play className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-1">Nothing playing yet</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          Open <span className="text-foreground font-medium">Test Mode</span> to
          simulate driving through Wheatbelt towns and trigger clips
          automatically. Or tap a clip below to play it manually.
        </p>
        <div className="w-full max-w-md space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-left">
            Available clips
          </h3>
          <div className="space-y-1 max-h-80 overflow-y-auto scroll-area-thin">
            {clips.map((clip) => (
              <button
                key={clip.id}
                onClick={() => playClip(clip.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-md bg-primary/15 flex items-center justify-center flex-shrink-0">
                  <Play className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{clip.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {clip.subtitle}
                  </div>
                </div>
                <Badge
                  variant={clip.audioReady ? "default" : "secondary"}
                  className="text-[10px] flex-shrink-0"
                >
                  {clip.audioReady ? "Ready" : "No audio"}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const progressPct = durationSec > 0 ? (positionSec / durationSec) * 100 : 0;
  const upcomingClips = queue.slice(0, 5);

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Current clip card */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold leading-tight mb-1">
              {currentClip.title}
            </h2>
            {currentClip.subtitle && (
              <p className="text-sm text-muted-foreground">
                {currentClip.subtitle}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => usePlayerStore.getState().playNext()}
            aria-label="Skip to next clip"
            className="flex-shrink-0"
          >
            <SkipForward className="w-5 h-5" />
          </Button>
        </div>

        {/* Trigger badge */}
        <div className="mb-4">
          <TriggerBadge clip={currentClip} />
        </div>

        {/* Progress bar (seekable) */}
        <div
          className="relative cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (durationSec > 0) seek(pct * durationSec);
          }}
        >
          <Progress value={progressPct} className="h-2" />
          <div className="flex justify-between text-[11px] text-muted-foreground mt-1 font-mono">
            <span>{formatTime(positionSec)}</span>
            <span>{formatTime(durationSec)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5" />
            ) : (
              <Volume2 className="w-5 h-5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => skipBackward(15)}
            aria-label="Skip back 15 seconds"
          >
            <SkipBack className="w-6 h-6" />
          </Button>
          <Button
            size="lg"
            onClick={togglePlay}
            className="w-16 h-16 rounded-full"
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 ml-0.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => skipForward(15)}
            aria-label="Skip forward 15 seconds"
          >
            <SkipForward className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => skipClip(currentClip.id)}
            aria-label="Skip this clip"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
            {error}
          </div>
        )}
      </Card>

      {/* Expandable transcript / details */}
      <Card className="overflow-hidden">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
        >
          <span className="text-sm font-medium">Transcript &amp; trigger info</span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        {expanded && (
          <div className="px-4 pb-4 space-y-3">
            <Separator />
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Transcript
              </div>
              <p className="text-sm leading-relaxed">{currentClip.script}</p>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Trigger
              </div>
              <TriggerDetail clip={currentClip} />
            </div>
          </div>
        )}
      </Card>

      {/* Up next */}
      {upcomingClips.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Up next ({queue.length})
            </h3>
          </div>
          <div className="space-y-1">
            {upcomingClips.map((clip, idx) => (
              <button
                key={clip.id}
                onClick={() => playClip(clip.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left",
                  idx === 0 && "bg-muted/40",
                )}
              >
                <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center flex-shrink-0 text-xs font-mono text-muted-foreground">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{clip.title}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {clip.subtitle}
                  </div>
                </div>
                <TriggerBadge clip={clip} compact />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matched triggers (active geofences / SLK ranges) */}
      {matchedClipIds.size > 0 && (
        <div className="px-1">
          <div className="text-[11px] text-muted-foreground">
            <span className="text-primary">●</span> {matchedClipIds.size} trigger
            (s) currently matched
          </div>
        </div>
      )}
    </div>
  );
}

function TriggerBadge({
  clip,
  compact = false,
}: {
  clip: { trigger: { type: string } };
  compact?: boolean;
}) {
  if (clip.trigger.type === "slk-range") {
    return (
      <Badge variant="secondary" className={compact ? "text-[10px]" : "text-xs"}>
        SLK range
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={compact ? "text-[10px]" : "text-xs"}>
      Geofence
    </Badge>
  );
}

function TriggerDetail({
  clip,
}: {
  clip: {
    trigger:
      | { type: "slk-range"; roadId: string; slkStart: number; slkEnd: number; direction: string }
      | { type: "geofence"; lat: number; lon: number; radiusM: number };
  };
}) {
  if (clip.trigger.type === "slk-range") {
    const t = clip.trigger;
    return (
      <div className="text-sm space-y-1 font-mono">
        <div>Road: <span className="text-primary">{t.roadId}</span></div>
        <div>SLK range: {t.slkStart} – {t.slkEnd} km</div>
        <div>
          Direction: <span className="text-primary">{t.direction}</span>{" "}
          <span className="text-muted-foreground text-xs">
            ({t.direction === "increasing" ? "True Left carriageway" : "True Right carriageway"})
          </span>
        </div>
      </div>
    );
  }
  const t = clip.trigger;
  return (
    <div className="text-sm space-y-1 font-mono">
      <div>Lat: {t.lat.toFixed(4)}°</div>
      <div>Lon: {t.lon.toFixed(4)}°</div>
      <div>Radius: {t.radiusM} m</div>
    </div>
  );
}
