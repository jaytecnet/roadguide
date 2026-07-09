"use client";

import { useEffect, useState } from "react";
import { Database, RefreshCw, Trash2, Info, Github } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  totalAudioSize,
  listAudioIds,
  wipeDb,
  refreshSeedAudio,
  seedIfNeeded,
} from "@/lib/offline-db";
import { useTripStore } from "@/store/trip-store";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function Settings() {
  const { toast } = useToast();
  const loadTrips = useTripStore((s) => s.loadTrips);
  const [audioSize, setAudioSize] = useState(0);
  const [audioCount, setAudioCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [resetting, setResetting] = useState(false);

  const refreshStats = async () => {
    try {
      const [size, ids] = await Promise.all([totalAudioSize(), listAudioIds()]);
      setAudioSize(size);
      setAudioCount(ids.length);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    void refreshStats();
  }, []);

  const handleRefreshAudio = async () => {
    setRefreshing(true);
    try {
      const result = await refreshSeedAudio();
      await refreshStats();
      await loadTrips();
      toast({
        title: "Audio refreshed",
        description: `${result.audioDownloaded} downloaded, ${result.audioSkipped} cached`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Refresh failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await wipeDb();
      await seedIfNeeded(true);
      await refreshStats();
      await loadTrips();
      toast({
        title: "Cache reset",
        description: "Database wiped and re-seeded",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="px-1">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage offline audio cache and app data.
        </p>
      </div>

      {/* Audio cache */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Audio cache</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Size
            </div>
            <div className="text-lg font-semibold font-mono">
              {formatBytes(audioSize)}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Clips
            </div>
            <div className="text-lg font-semibold font-mono">{audioCount}</div>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleRefreshAudio}
            disabled={refreshing}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh audio"}
          </Button>
          <Button
            onClick={handleReset}
            disabled={resetting}
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {resetting ? "Resetting..." : "Reset cache (re-seed)"}
          </Button>
        </div>
      </Card>

      {/* About */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">About</h3>
        </div>
        <div className="text-xs space-y-2 text-muted-foreground leading-relaxed">
          <p>
            <span className="text-foreground font-medium">Wheatbelt Audio Companion</span>{" "}
            · v0.1.0 (MVP)
          </p>
          <p>
            Location-triggered audio commentary for Western Australian Wheatbelt
            road trips. Offline-first PWA — works fully offline once audio is
            downloaded.
          </p>
          <p>
            Road data: MRWA ArcGIS Layer 17 (Phase 3) · Audio: z-ai TTS ·
            Storage: IndexedDB
          </p>
        </div>
      </Card>

      {/* Roadmap */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Roadmap</h3>
        </div>
        <ul className="text-xs space-y-1.5 text-muted-foreground">
          <li>
            <span className="text-foreground">✓ Phase 1:</span> PWA shell +
            test mode + audio playback
          </li>
          <li>
            <span className="text-foreground">✓ Phase 2:</span> Multi-trip
            playlists
          </li>
          <li>
            <span className="text-foreground">Next:</span> GPS + EKF + MRWA
            Layer 17 road geometry
          </li>
          <li>
            <span className="text-foreground">Then:</span> Background audio
            hardening on Samsung S22 Ultra
          </li>
          <li>
            <span className="text-foreground">Later:</span> TTS script editor +
            content pipeline
          </li>
        </ul>
      </Card>
    </div>
  );
}
