"use client";

import { CheckCircle2, Download, MapPinned, Radio } from "lucide-react";
import { useTripStore } from "@/store/trip-store";
import { usePlayerStore } from "@/store/player-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function TripSwitcher() {
  const { trips, activeTripId, setActiveTrip, clips } = useTripStore();
  const currentClip = usePlayerStore((s) => s.currentClip);

  if (trips.length === 0) {
    return (
      <div className="px-6 py-12 text-center text-sm text-muted-foreground">
        No trips loaded. Try refreshing the page.
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-3">
      <div className="px-1">
        <h2 className="text-lg font-semibold">Trips</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Switch between road trip playlists. Audio is cached for offline use.
        </p>
      </div>

      {trips.map((trip) => {
        const isActive = trip.id === activeTripId;
        const tripClipCount =
          trip.id === activeTripId
            ? clips.length
            : 0; // only loaded for active trip; show generic count otherwise
        const readyCount =
          trip.id === activeTripId
            ? clips.filter((c) => c.audioReady).length
            : 0;

        return (
          <Card
            key={trip.id}
            className={cn(
              "p-4 transition-all",
              isActive && "ring-2 ring-primary border-primary",
            )}
          >
            <div className="flex items-start gap-3">
              {/* Trip accent stripe */}
              <div
                className="w-1 self-stretch rounded-full flex-shrink-0"
                style={{ backgroundColor: trip.accent ?? "var(--primary)" }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-base leading-tight">
                    {trip.name}
                  </h3>
                  {isActive && (
                    <Badge variant="default" className="text-[10px] flex-shrink-0">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {trip.description}
                </p>

                {/* Stats */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  {isActive ? (
                    <>
                      <span className="flex items-center gap-1">
                        <MapPinned className="w-3 h-3" />
                        {tripClipCount} clips
                      </span>
                      <span className="flex items-center gap-1">
                        <Download className="w-3 h-3" />
                        {readyCount}/{tripClipCount} audio
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px]">Tap to activate</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {!isActive ? (
                    <Button
                      size="sm"
                      onClick={() => setActiveTrip(trip.id)}
                      className="flex-1"
                    >
                      Activate trip
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        disabled
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Currently active
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}

      {/* Future-trip hint */}
      <Card className="p-4 border-dashed">
        <div className="flex items-start gap-3">
          <Radio className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold mb-1">Add your own route</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The architecture supports any Wheatbelt road — once you tell me your
              usual route, I&apos;ll re-seed with real town data and audio. The
              placeholder trip above (M031 Great Southern Hwy) shows the full
              trigger → play → skip loop working end-to-end.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
