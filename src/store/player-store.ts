import { create } from "zustand";
import { audioPlayer, type PlayerState } from "@/lib/audio/player";

/**
 * Player store — thin Zustand wrapper around the AudioPlayer singleton.
 *
 * The singleton owns the transport logic (HTML5 audio element, queue, preload).
 * This store mirrors its state into React via `audioPlayer.subscribe`.
 *
 * Components read state from this store and call actions on the singleton.
 */

interface PlayerStore extends PlayerState {
  /** Synced from the singleton — call once on mount. */
  syncFromPlayer: (state: PlayerState) => void;
  /** Toggle play/pause. */
  togglePlay: () => void;
  /** Skip to next clip in queue. */
  playNext: () => Promise<void>;
  /** Skip forward N seconds (default 15). */
  skipForward: (sec?: number) => void;
  /** Skip backward N seconds (default 15). */
  skipBackward: (sec?: number) => void;
  /** Seek to position. */
  seek: (sec: number) => void;
  /** Toggle mute. */
  toggleMute: () => void;
}

const initialState: PlayerState = {
  currentClip: null,
  currentUrl: null,
  isPlaying: false,
  isMuted: false,
  positionSec: 0,
  durationSec: 0,
  isLoading: false,
  error: null,
  queue: [],
};

export const usePlayerStore = create<PlayerStore>((set) => ({
  ...initialState,

  syncFromPlayer: (state) => set(state),

  togglePlay: () => audioPlayer.togglePlay(),
  playNext: async () => {
    await audioPlayer.playNext();
  },
  skipForward: (sec?: number) => audioPlayer.skipForward(sec ?? 15),
  skipBackward: (sec?: number) => audioPlayer.skipBackward(sec ?? 15),
  seek: (sec) => audioPlayer.seek(sec),
  toggleMute: () => audioPlayer.setMuted(!audioPlayer.getState().isMuted),
}));

/**
 * Subscribe the Zustand store to the audioPlayer singleton's state.
 * Call this once on app mount (from a useEffect in the AppShell).
 */
export function bindPlayerToStore(): () => void {
  return audioPlayer.subscribe((state) => {
    usePlayerStore.getState().syncFromPlayer(state);
  });
}
