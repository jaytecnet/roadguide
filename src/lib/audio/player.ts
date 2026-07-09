import type { Clip } from "@/lib/types";

/**
 * AudioPlayer — singleton wrapper around the HTML5 <audio> element.
 *
 * Responsibilities:
 *   - Load audio from an object URL (sourced from IndexedDB blob)
 *   - Emit state changes (playing, ended, timeupdate, error) to subscribers
 *   - Preload the next clip when within `preloadThresholdSec` of the end
 *   - Auto-play the next clip in the queue when current ends (full auto-play)
 *
 * Media Session API integration is in `media-session.ts` — this class is
 * transport-only and does not touch the lock-screen UI.
 */

export interface PlayerState {
  /** Currently loaded clip, or null if nothing loaded. */
  currentClip: Clip | null;
  /** Object URL for the current clip's audio blob (must be revoked when replaced). */
  currentUrl: string | null;
  /** Whether audio is actively playing. */
  isPlaying: boolean;
  /// Whether audio is muted.
  isMuted: boolean;
  /** Current playback position in seconds. */
  positionSec: number;
  /** Total duration in seconds (0 if not yet loaded). */
  durationSec: number;
  /** Loading state — true while fetching the blob from IndexedDB. */
  isLoading: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Queue of upcoming clips, in play order. */
  queue: Clip[];
}

export type PlayerStateListener = (state: PlayerState) => void;

const PRELOAD_THRESHOLD_SEC = 30; // preload next clip when within 30s of end
const CLEANUP_THRESHOLD_SEC = 2; // cleanup old URL when this close to end

class AudioPlayerImpl {
  private audio: HTMLAudioElement | null = null;
  private state: PlayerState = {
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
  private listeners = new Set<PlayerStateListener>();
  private nextClipUrl: string | null = null;
  /** Function to call to load the next clip's audio URL — set by store. */
  private loadNextClipUrl: (() => Promise<string | null>) | null = null;
  /** Callback fired whenever currentClip changes (for Media Session sync). */
  private onClipChanged: ((clip: Clip | null) => void) | null = null;

  /** Must be called once after first user interaction (browser autoplay policy). */
  init(): void {
    if (this.audio) return;
    if (typeof window === "undefined") return;

    this.audio = new Audio();
    this.audio.preload = "auto";

    this.audio.addEventListener("play", () => this.patch({ isPlaying: true }));
    this.audio.addEventListener("pause", () =>
      this.patch({ isPlaying: false }),
    );
    this.audio.addEventListener("timeupdate", () => {
      if (!this.audio) return;
      const pos = this.audio.currentTime;
      const dur = this.audio.duration || 0;
      this.patch({ positionSec: pos, durationSec: dur });

      // Preload next clip when approaching end
      if (
        dur > 0 &&
        dur - pos <= PRELOAD_THRESHOLD_SEC &&
        this.nextClipUrl === null &&
        this.state.queue.length > 0
      ) {
        void this.preloadNext();
      }
    });
    this.audio.addEventListener("ended", () => {
      // Auto-play next in queue (full auto-play mode)
      void this.playNext();
    });
    this.audio.addEventListener("error", () => {
      const err = this.audio?.error;
      this.patch({
        error: err
          ? `Audio error (code ${err.code})`
          : "Unknown audio error",
        isPlaying: false,
      });
    });
    this.audio.addEventListener("loadstart", () =>
      this.patch({ isLoading: true }),
    );
    this.audio.addEventListener("canplay", () =>
      this.patch({ isLoading: false }),
    );
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: PlayerStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state); // emit current state immediately
    return () => this.listeners.delete(listener);
  }

  /** Get the current state snapshot. */
  getState(): PlayerState {
    return this.state;
  }

  /** Set the queue of upcoming clips (excluding the current one). */
  setQueue(clips: Clip[]): void {
    this.patch({ queue: clips });
    this.nextClipUrl = null; // invalidate preloaded URL
  }

  /** Set the function used to load the next clip's audio URL. */
  setLoadNextUrlFn(fn: () => Promise<string | null>): void {
    this.loadNextClipUrl = fn;
  }

  /** Set the callback fired whenever currentClip changes. */
  setOnClipChanged(fn: ((clip: Clip | null) => void) | null): void {
    this.onClipChanged = fn;
  }

  /**
   * Load a clip and (by default) auto-play it.
   * Caller is responsible for providing the object URL — typically obtained
   * from `createAudioUrl(clip.id)` in the offline-db audio module.
   */
  async loadClip(clip: Clip, url: string, autoplay = true): Promise<void> {
    if (!this.audio) this.init();
    if (!this.audio) return;

    // Revoke previous URL to prevent memory leaks
    if (this.state.currentUrl) {
      URL.revokeObjectURL(this.state.currentUrl);
    }

    this.patch({
      currentClip: clip,
      currentUrl: url,
      positionSec: 0,
      durationSec: 0,
      error: null,
      isLoading: true,
    });

    // Notify Media Session sync callback
    this.onClipChanged?.(clip);

    this.audio.src = url;
    this.audio.load();

    if (autoplay) {
      try {
        await this.audio.play();
      } catch (err) {
        // Autoplay may be blocked by browser policy — surface the error
        this.patch({
          error: `Playback blocked: ${err instanceof Error ? err.message : String(err)}`,
          isPlaying: false,
          isLoading: false,
        });
      }
    }
  }

  /** Play the current clip (resumes if paused). */
  async play(): Promise<void> {
    if (!this.audio) return;
    try {
      await this.audio.play();
    } catch (err) {
      this.patch({
        error: `Play failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  /** Pause the current clip. */
  pause(): void {
    this.audio?.pause();
  }

  /** Toggle play/pause. */
  togglePlay(): void {
    if (this.audio?.paused) {
      void this.play();
    } else {
      this.pause();
    }
  }

  /** Seek to a position in seconds. */
  seek(sec: number): void {
    if (this.audio) this.audio.currentTime = sec;
  }

  /** Skip forward by N seconds (default 15). */
  skipForward(sec = 15): void {
    if (this.audio) {
      this.audio.currentTime = Math.min(
        this.audio.currentTime + sec,
        this.audio.duration || 0,
      );
    }
  }

  /** Skip backward by N seconds (default 15). */
  skipBackward(sec = 15): void {
    if (this.audio) {
      this.audio.currentTime = Math.max(this.audio.currentTime - sec, 0);
    }
  }

  /** Set mute state. */
  setMuted(muted: boolean): void {
    if (this.audio) this.audio.muted = muted;
    this.patch({ isMuted: muted });
  }

  /** Skip the current clip and play the next one in the queue. */
  async playNext(): Promise<void> {
    const next = this.state.queue[0];
    if (!next) {
      this.patch({ isPlaying: false });
      return;
    }

    // Use preloaded URL if available
    let url = this.nextClipUrl;
    if (!url) {
      url = await this.loadNextClipUrl?.();
    }
    if (!url) {
      this.patch({ error: `No audio available for "${next.title}"` });
      return;
    }

    // Shift queue + load
    const remainingQueue = this.state.queue.slice(1);
    this.nextClipUrl = null;
    await this.loadClip(next, url, true);
    this.patch({ queue: remainingQueue });
  }

  /** Stop playback entirely. */
  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
    }
    if (this.state.currentUrl) {
      URL.revokeObjectURL(this.state.currentUrl);
    }
    this.patch({
      currentClip: null,
      currentUrl: null,
      isPlaying: false,
      positionSec: 0,
      durationSec: 0,
    });
    this.onClipChanged?.(null);
  }

  /** Preload the next clip's audio URL into memory. */
  private async preloadNext(): Promise<void> {
    if (this.nextClipUrl !== null) return;
    const url = await this.loadNextClipUrl?.();
    if (url) {
      this.nextClipUrl = url;
      // Also preload the audio element
      const preloadAudio = new Audio();
      preloadAudio.src = url;
      preloadAudio.load();
    }
  }

  /** Patch state and notify listeners. */
  private patch(partial: Partial<PlayerState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

/** Singleton audio player instance. */
export const audioPlayer = new AudioPlayerImpl();
