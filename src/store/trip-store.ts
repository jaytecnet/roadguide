import { create } from "zustand";
import type { Clip, Trip, VehiclePosition } from "@/lib/types";
import { evaluateTriggers } from "@/lib/triggers";
import {
  getClipsForTrip,
  getTrip,
  getAllTrips,
} from "@/lib/offline-db";
import { createAudioUrl, hasAudio } from "@/lib/offline-db";
import { audioPlayer } from "@/lib/audio/player";
import {
  initMediaSession,
  setMediaSessionMetadata,
  setPlaybackState,
} from "@/lib/audio/media-session";

/**
 * Trip store — owns the active trip, its clips, the current vehicle position,
 * and the trigger evaluation loop.
 *
 * In test mode, the position is driven by the SLK slider.
 * In production (Phase 3+), the position is driven by GPS + EKF.
 *
 * The store runs the trigger evaluation on every position update and queues
 * matched clips into the audio player for full auto-play.
 */

interface TripStore {
  /** All available trips (loaded from IndexedDB on mount). */
  trips: Trip[];
  /** Currently active trip id. */
  activeTripId: string | null;
  /** Clips for the active trip, in play order. */
  clips: Clip[];
  /** Current vehicle position (GPS or test mode). */
  position: VehiclePosition | null;
  /** Ids of clips currently matched by triggers. */
  matchedClipIds: Set<string>;
  /** Whether media session has been initialised (after first interaction). */
  mediaSessionReady: boolean;
  /** Loading state. */
  loading: boolean;
  /** Error message. */
  error: string | null;

  /** Load all trips from IndexedDB. */
  loadTrips: () => Promise<void>;
  /** Switch the active trip by id. Loads its clips. */
  setActiveTrip: (tripId: string) => Promise<void>;
  /** Update the vehicle position and re-evaluate triggers. */
  updatePosition: (pos: VehiclePosition) => Promise<void>;
  /** Initialise Media Session — call after first user interaction. */
  initMedia: () => void;
  /** Skip a clip by id — removes it from queue + advances. */
  skipClip: (clipId: string) => Promise<void>;
  /** Manually trigger a clip by id (for tap-to-play from list). */
  playClip: (clipId: string) => Promise<void>;
}

export const useTripStore = create<TripStore>((set, get) => ({
  trips: [],
  activeTripId: null,
  clips: [],
  position: null,
  matchedClipIds: new Set(),
  mediaSessionReady: false,
  loading: false,
  error: null,

  loadTrips: async () => {
    set({ loading: true, error: null });
    try {
      const trips = await getAllTrips();
      set({ trips, loading: false });
      // Auto-activate the first trip if none is active
      if (!get().activeTripId && trips.length > 0) {
        await get().setActiveTrip(trips[0].id);
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setActiveTrip: async (tripId) => {
    set({ loading: true, error: null });
    try {
      const trip = await getTrip(tripId);
      if (!trip) throw new Error(`Trip not found: ${tripId}`);
      const clips = await getClipsForTrip(tripId);
      set({
        activeTripId: tripId,
        clips,
        matchedClipIds: new Set(),
        loading: false,
      });
      // Wire up the audio player's load-next-url function for this trip
      audioPlayer.setLoadNextUrlFn(async () => {
        const queue = audioPlayer.getState().queue;
        const nextClip = queue[0];
        if (!nextClip) return null;
        if (!(await hasAudio(nextClip.id))) return null;
        return createAudioUrl(nextClip.id);
      });
      // Wire up Media Session sync — fires whenever currentClip changes
      // (covers playNext auto-advance, not just explicit playClip calls)
      audioPlayer.setOnClipChanged((clip) => {
        if (clip && get().mediaSessionReady) {
          setMediaSessionMetadata(clip);
          setPlaybackState("playing");
        }
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  updatePosition: async (pos) => {
    const { clips, matchedClipIds } = get();
    set({ position: pos });

    const evalResult = evaluateTriggers(pos, clips, matchedClipIds);

    if (evalResult.matched.length === 0 && evalResult.cleared.length === 0) {
      return; // no change
    }

    // Update matched set
    const newMatched = new Set(matchedClipIds);
    for (const id of evalResult.cleared) newMatched.delete(id);
    for (const clip of evalResult.matched) newMatched.add(clip.id);
    set({ matchedClipIds: newMatched });

    // If a new clip matched and nothing is currently playing, auto-play it
    const playerState = audioPlayer.getState();
    const newlyMatched = evalResult.matched.filter(
      (c) => !matchedClipIds.has(c.id),
    );

    if (newlyMatched.length === 0) return;

    // Pick the first newly-matched clip with audio ready
    const clipToPlay = await pickPlayableClip(newlyMatched);
    if (!clipToPlay) return;

    // Build queue: only clips AHEAD of the triggered clip (by order),
    // so the queue represents "what's coming up on the road ahead".
    const clipsAhead = get().clips.filter((c) => c.order > clipToPlay.order);

    // If something is already playing and the new clip is different,
    // queue it as next (interrupting the current queue).
    if (playerState.currentClip && playerState.currentClip.id !== clipToPlay.id) {
      audioPlayer.setQueue([clipToPlay, ...clipsAhead]);
    } else if (!playerState.currentClip) {
      const url = await createAudioUrl(clipToPlay.id);
      if (url) {
        audioPlayer.setQueue(clipsAhead);
        await audioPlayer.loadClip(clipToPlay, url, true);
        if (get().mediaSessionReady) {
          setMediaSessionMetadata(clipToPlay);
          setPlaybackState("playing");
        }
      }
    }
  },

  initMedia: () => {
    if (get().mediaSessionReady) return;
    if (initMediaSession()) {
      set({ mediaSessionReady: true });
    }
  },

  skipClip: async (clipId) => {
    // Remove from queue; if it's the current clip, advance to next
    const playerState = audioPlayer.getState();
    if (playerState.currentClip?.id === clipId) {
      await audioPlayer.playNext();
    } else {
      const newQueue = playerState.queue.filter((c) => c.id !== clipId);
      audioPlayer.setQueue(newQueue);
    }
    // Also remove from matched set so it doesn't re-fire immediately
    const matched = new Set(get().matchedClipIds);
    matched.delete(clipId);
    set({ matchedClipIds: matched });
  },

  playClip: async (clipId) => {
    const clip = get().clips.find((c) => c.id === clipId);
    if (!clip) return;
    if (!(await hasAudio(clipId))) {
      set({ error: `Audio not downloaded for "${clip.title}"` });
      return;
    }
    const url = await createAudioUrl(clipId);
    if (!url) return;
    // Build queue: this clip first, then everything after it
    const idx = get().clips.findIndex((c) => c.id === clipId);
    const queue = get().clips.slice(idx + 1);
    audioPlayer.setQueue(queue);
    await audioPlayer.loadClip(clip, url, true);
    if (get().mediaSessionReady) {
      setMediaSessionMetadata(clip);
      setPlaybackState("playing");
    }
  },
}));

/** Pick the first clip with audio ready, in the order given. */
async function pickPlayableClip(
  clips: Clip[],
): Promise<Clip | null> {
  for (const clip of clips) {
    if (clip.audioReady && (await hasAudio(clip.id))) {
      return clip;
    }
  }
  return null;
}
