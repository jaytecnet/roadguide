"use client";

import { useEffect, useState } from "react";
import { MapPin, ListMusic, Navigation, Settings as SettingsIcon } from "lucide-react";
import { useUiStore, type Tab } from "@/store/ui-store";
import { useTripStore } from "@/store/trip-store";
import { usePlayerStore, bindPlayerToStore } from "@/store/player-store";
import { NowPlaying } from "./now-playing";
import { TripSwitcher } from "./trip-switcher";
import { Drive } from "./drive";
import { Settings } from "./settings";
import { audioPlayer } from "@/lib/audio/player";
import { setPlaybackState } from "@/lib/audio/media-session";
import { seedIfNeeded } from "@/lib/offline-db";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: Tab; label: string; icon: typeof MapPin }> = [
  { id: "now-playing", label: "Playing", icon: MapPin },
  { id: "trips", label: "Trips", icon: ListMusic },
  { id: "drive", label: "Drive", icon: Navigation },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell() {
  const activeTab = useUiStore((s) => s.activeTab);
  const setActiveTab = useUiStore((s) => s.setActiveTab);
  const driveMode = useUiStore((s) => s.driveMode);
  const loadTrips = useTripStore((s) => s.loadTrips);
  const initMedia = useTripStore((s) => s.initMedia);
  const trips = useTripStore((s) => s.trips);
  const activeTripId = useTripStore((s) => s.activeTripId);
  const journey = useTripStore((s) => s.journey);
  const currentClip = usePlayerStore((s) => s.currentClip);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  // One-time init: seed DB, load trips, bind player to store, init audio
  useEffect(() => {
    let unbind: (() => void) | undefined;

    (async () => {
      try {
        setSeedStatus("Seeding database...");
        const result = await seedIfNeeded();
        const parts: string[] = [];
        if (result.audioDownloaded > 0) parts.push(`${result.audioDownloaded} audio`);
        if (result.roadsGeometriesLoaded > 0) parts.push(`${result.roadsGeometriesLoaded} roads`);
        setSeedStatus(
          parts.length > 0
            ? `Loaded ${parts.join(" + ")}`
            : result.audioSkipped > 0
              ? `${result.audioSkipped} clips cached`
              : null,
        );
        await loadTrips();
        // Initialise audio player + bind to store
        audioPlayer.init();
        unbind = bindPlayerToStore();
      } catch (err) {
        setSeedStatus(
          `Init error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    })();

    return () => {
      unbind?.();
    };
  }, [loadTrips]);

  // Initialise Media Session on first user interaction (browser autoplay policy)
  useEffect(() => {
    const handler = () => {
      initMedia();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [initMedia]);

  const activeTrip = trips.find((t) => t.id === activeTripId);
  const mediaSessionReady = useTripStore((s) => s.mediaSessionReady);

  // Sync isPlaying → Media Session playback state
  useEffect(() => {
    if (!mediaSessionReady) return;
    setPlaybackState(isPlaying ? "playing" : "paused");
  }, [isPlaying, mediaSessionReady]);

  const playedCount = journey?.playedClipIds.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/icon-96.png" alt="" className="w-7 h-7 rounded-md flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight truncate">
                Wheatbelt Audio
              </div>
              <div className="text-[11px] text-muted-foreground leading-tight truncate">
                {activeTrip ? activeTrip.name : "No trip active"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {journey && (
              <div className="text-[11px] text-muted-foreground text-right">
                <div className="font-mono">{playedCount} played</div>
                <div className="text-[10px] opacity-70">this journey</div>
              </div>
            )}
            {seedStatus && !journey && (
              <div className="text-[11px] text-muted-foreground truncate max-w-[40%] text-right">
                {seedStatus}
              </div>
            )}
            {/* Drive mode indicator */}
            {driveMode === "live" && (
              <span className="flex items-center gap-1 text-[10px] font-mono text-primary bg-primary/10 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                LIVE
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Tab content */}
      <main className="flex-1 overflow-y-auto pb-32 scroll-area-thin">
        {activeTab === "now-playing" && <NowPlaying />}
        {activeTab === "trips" && <TripSwitcher />}
        {activeTab === "drive" && <Drive />}
        {activeTab === "settings" && <Settings />}
      </main>

      {/* Mini player (above bottom nav) — shown when a clip is loaded */}
      {currentClip && (
        <button
          onClick={() => setActiveTab("now-playing")}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-2 right-2 z-20 flex items-center gap-3 p-3 rounded-xl bg-card border border-border shadow-lg backdrop-blur"
          aria-label={`Now playing: ${currentClip.title}. ${isPlaying ? "Pause" : "Play"}`}
        >
          <div className="w-9 h-9 rounded-md bg-primary/20 flex items-center justify-center flex-shrink-0">
            {isPlaying ? (
              <span className="text-primary text-xs font-mono">▶</span>
            ) : (
              <span className="text-muted-foreground text-xs font-mono">⏸</span>
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium truncate">{currentClip.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {currentClip.subtitle}
            </div>
          </div>
        </button>
      )}

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div
          className="grid grid-cols-4 gap-1 px-2"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 px-1 rounded-lg transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
