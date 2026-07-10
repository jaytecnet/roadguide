import { create } from "zustand";
import type { Clip, JourneyState, Trip, VehiclePosition } from "@/lib/types";
import { evaluateTriggers } from "@/lib/triggers";
import {
  getClipsForTrip,
  getTrip,
  getAllTrips,
} from "@/lib/offline-db";
import { createAudioUrl, hasAudio } from "@/lib/offline-db";
import {
  deleteClip as dbDeleteClip,
  createClip as dbCreateClip,
  markClipAudioNotReady,
} from "@/lib/offline-db/clips";
import { deleteAudio } from "@/lib/offline-db/audio";
import { audioPlayer } from "@/lib/audio/player";
import {
  initMediaSession,
  setMediaSessionMetadata,
  setPlaybackState,
} from "@/lib/audio/media-session";

/**
 * Trip store — owns the active trip, its clips, the current vehicle position,
 * the trigger evaluation loop, and per-journey "played" state.
 *
 * Journey model:
 *   - A journey is a single road-trip session. When you start a new journey,
 *     all clips reset to "not played".
 *   - A clip is marked "played" when:
 *       a) it plays to completion (audio 'ended' event), OR
 *       b) it's explicitly skipped via skipClip()
 *   - Played clips are filtered OUT of trigger evaluation — they won't re-fire
 *     for the current journey even if you re-enter their geofence.
 *   - Starting a new journey clears the played set.
 *
 * Position sources:
 *   - "test"  — driven by the SLK slider / town quick-jump buttons in Test Mode
 *   - "gps"   — driven by useGpsTracking hook (watchPosition → EKF)
 *
 * Both sources feed into the same updatePosition() method, which runs trigger
 * evaluation and auto-plays matched clips.
 */

const JOURNEY_STORAGE_KEY = "wheatbelt-active-journey";

interface TripStore {
  /** All available trips (loaded from IndexedDB on mount). */
  trips: Trip[];
  /** Currently active trip id. */
  activeTripId: string | null;
  /** Clips for the active trip, in play order. */
  clips: Clip[];
  /** Current vehicle position (GPS or test mode). */
  position: VehiclePosition | null;
  /** Ids of clips currently matched by triggers (i.e. inside a geofence right now). */
  matchedClipIds: Set<string>;
  /** Active journey state — tracks which clips have been played this journey. */
  journey: JourneyState | null;
  /** Whether media session has been initialised (after first interaction). */
  mediaSessionReady: boolean;
  /** Loading state. */
  loading: boolean;
  /** Error message. */
  error: string | null;

  /** Load all trips from IndexedDB. */
  loadTrips: () => Promise<void>;
  /** Switch the active trip by id. Loads its clips + starts a fresh journey. */
  setActiveTrip: (tripId: string) => Promise<void>;
  /** Update the vehicle position and re-evaluate triggers. */
  updatePosition: (pos: VehiclePosition) => Promise<void>;
  /** Initialise Media Session — call after first user interaction. */
  initMedia: () => void;
  /** Mark a clip as played (called on audio 'ended' or explicit skip). */
  markClipPlayed: (clipId: string) => void;
  /** Skip a clip by id — marks played + advances to next. */
  skipClip: (clipId: string) => Promise<void>;
  /** Manually trigger a clip by id (for tap-to-play from list). */
  playClip: (clipId: string) => Promise<void>;
  /** Start a new journey — clears played set + re-enables all triggers. */
  startNewJourney: () => void;
  /** Restore journey from localStorage on app mount. */
  restoreJourney: () => void;
  /** Reload clips for the active trip from IndexedDB (after edits). */
  reloadClips: () => Promise<void>;
  /** Create a new clip in the active trip. Returns the created clip. */
  createClip: (partial: Partial<Clip>) => Promise<Clip | null>;
  /** Save edits to an existing clip. */
  saveClip: (clip: Clip) => Promise<void>;
  /** Delete a clip + its audio. */
  deleteClip: (clipId: string) => Promise<void>;
  /** Delete audio for a clip (keeps the clip metadata). */
  deleteClipAudio: (clipId: string) => Promise<void>;
}

export const useTripStore = create<TripStore>((set, get) => ({
  trips: [],
  activeTripId: null,
  clips: [],
  position: null,
  matchedClipIds: new Set(),
  journey: null,
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
      } else {
        // Restore journey from localStorage
        get().restoreJourney();
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
      // Start a fresh journey for the new trip
      const journey: JourneyState = {
        id: `journey-${Date.now()}`,
        tripId,
        startedAt: Date.now(),
        playedClipIds: [],
      };
      set({ journey });
      persistJourney(journey);

      // Wire up the audio player's load-next-url function for this trip
      audioPlayer.setLoadNextUrlFn(async () => {
        const queue = audioPlayer.getState().queue;
        const nextClip = queue[0];
        if (!nextClip) return null;
        if (!(await hasAudio(nextClip.id))) return null;
        return createAudioUrl(nextClip.id);
      });
      // Wire up Media Session sync — fires whenever currentClip changes
      audioPlayer.setOnClipChanged((clip) => {
        if (clip && get().mediaSessionReady) {
          setMediaSessionMetadata(clip);
          setPlaybackState("playing");
        }
      });
      // Wire up clip-completion → mark played
      audioPlayer.setOnClipCompleted((clip) => {
        if (clip) get().markClipPlayed(clip.id);
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  updatePosition: async (pos) => {
    const { clips, matchedClipIds, journey } = get();
    set({ position: pos });

    // Filter out already-played clips — they don't re-fire this journey
    const playedSet = new Set(journey?.playedClipIds ?? []);
    const unplayedClips = clips.filter((c) => !playedSet.has(c.id));

    const evalResult = evaluateTriggers(pos, unplayedClips, matchedClipIds);

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

    // Build queue: only unplayed clips AHEAD of the triggered clip (by order)
    const clipsAhead = get().clips.filter(
      (c) => c.order > clipToPlay.order && !playedSet.has(c.id),
    );

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

  markClipPlayed: (clipId) => {
    const { journey } = get();
    if (!journey) return;
    if (journey.playedClipIds.includes(clipId)) return;
    const updated: JourneyState = {
      ...journey,
      playedClipIds: [...journey.playedClipIds, clipId],
    };
    set({ journey: updated });
    persistJourney(updated);
    // Also remove from matched set so it doesn't show as "triggered"
    const matched = new Set(get().matchedClipIds);
    matched.delete(clipId);
    set({ matchedClipIds: matched });
  },

  skipClip: async (clipId) => {
    // Mark as played so it doesn't re-fire
    get().markClipPlayed(clipId);

    // Remove from queue; if it's the current clip, advance to next
    const playerState = audioPlayer.getState();
    if (playerState.currentClip?.id === clipId) {
      await audioPlayer.playNext();
    } else {
      const newQueue = playerState.queue.filter((c) => c.id !== clipId);
      audioPlayer.setQueue(newQueue);
    }
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
    // Build queue: unplayed clips after this one
    const playedSet = new Set(get().journey?.playedClipIds ?? []);
    const idx = get().clips.findIndex((c) => c.id === clipId);
    const queue = get()
      .clips.slice(idx + 1)
      .filter((c) => !playedSet.has(c.id));
    audioPlayer.setQueue(queue);
    await audioPlayer.loadClip(clip, url, true);
    if (get().mediaSessionReady) {
      setMediaSessionMetadata(clip);
      setPlaybackState("playing");
    }
  },

  startNewJourney: () => {
    const { activeTripId } = get();
    if (!activeTripId) return;
    const journey: JourneyState = {
      id: `journey-${Date.now()}`,
      tripId: activeTripId,
      startedAt: Date.now(),
      playedClipIds: [],
    };
    set({
      journey,
      matchedClipIds: new Set(),
    });
    persistJourney(journey);
    // Stop any current playback
    audioPlayer.stop();
  },

  restoreJourney: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(JOURNEY_STORAGE_KEY);
      if (!raw) return;
      const journey = JSON.parse(raw) as JourneyState;
      const { activeTripId } = get();
      // Only restore if journey matches the active trip
      if (journey.tripId === activeTripId) {
        set({ journey });
      }
    } catch {
      // Corrupt storage — ignore
    }
  },

  reloadClips: async () => {
    const { activeTripId } = get();
    if (!activeTripId) return;
    const clips = await getClipsForTrip(activeTripId);
    set({ clips });
  },

  createClip: async (partial) => {
    const { activeTripId } = get();
    if (!activeTripId) return null;
    const clip = await dbCreateClip(activeTripId, partial);
    await get().reloadClips();
    return clip;
  },

  saveClip: async (clip) => {
    const { putClip } = await import("@/lib/offline-db/clips");
    await putClip(clip);
    await get().reloadClips();
  },

  deleteClip: async (clipId) => {
    // If this clip is currently playing, stop playback
    const playerState = audioPlayer.getState();
    if (playerState.currentClip?.id === clipId) {
      audioPlayer.stop();
    }
    // Remove from queue if present
    const newQueue = playerState.queue.filter((c) => c.id !== clipId);
    if (newQueue.length !== playerState.queue.length) {
      audioPlayer.setQueue(newQueue);
    }
    // Delete from IndexedDB (clips + audio stores)
    await dbDeleteClip(clipId);
    // Remove from matched set + journey played set
    const matched = new Set(get().matchedClipIds);
    matched.delete(clipId);
    const { journey } = get();
    if (journey && journey.playedClipIds.includes(clipId)) {
      const updated: JourneyState = {
        ...journey,
        playedClipIds: journey.playedClipIds.filter((id) => id !== clipId),
      };
      set({ journey: updated, matchedClipIds: matched });
      persistJourney(updated);
    } else {
      set({ matchedClipIds: matched });
    }
    await get().reloadClips();
  },

  deleteClipAudio: async (clipId) => {
    // If this clip is currently playing, stop playback
    const playerState = audioPlayer.getState();
    if (playerState.currentClip?.id === clipId) {
      audioPlayer.stop();
    }
    await deleteAudio(clipId);
    await markClipAudioNotReady(clipId);
    await get().reloadClips();
  },
}));

/** Pick the first clip with audio ready, in the order given. */
async function pickPlayableClip(clips: Clip[]): Promise<Clip | null> {
  for (const clip of clips) {
    if (clip.audioReady && (await hasAudio(clip.id))) {
      return clip;
    }
  }
  return null;
}

function persistJourney(journey: JourneyState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(journey));
  } catch {
    // Storage full or disabled — ignore
  }
}
