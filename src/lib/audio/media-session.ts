import type { Clip } from "@/lib/types";
import { audioPlayer } from "./player";

/**
 * Media Session API integration.
 *
 * Sets metadata (title, artist, artwork) and action handlers (play, pause,
 * nexttrack, previoustrack, seekbackward, seekforward) on the browser's
 * MediaSession interface. This enables:
 *
 *   - Lock-screen / notification media controls on Android Chrome
 *   - Background audio playback (screen-off) when paired with a service worker
 *     that keeps the audio element alive
 *   - Bluetooth button handling (play/pause/skip on car stereos)
 *
 * Must be called after first user interaction (browser autoplay policy).
 */

const ARTWORK_SIZES = [96, 128, 192, 256, 384, 512];

function buildArtwork(): MediaImage[] {
  // Use the app icon at multiple sizes — for MVP we reuse the logo SVG.
  // Phase 6: generate proper per-trip artwork.
  return ARTWORK_SIZES.map((size) => ({
    src: `/icon-${size}.png`,
    sizes: `${size}x${size}`,
    type: "image/png",
  }));
}

/** Set the Media Session metadata for the currently-playing clip. */
export function setMediaSessionMetadata(clip: Clip): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: clip.title,
    artist: clip.subtitle ?? "Wheatbelt Audio Companion",
    album: "Wheatbelt Road Trip",
    artwork: buildArtwork(),
  });
}

/** Clear Media Session metadata (when playback ends or stops). */
export function clearMediaSession(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = "none";
}

/** Set the Media Session playback state. */
export function setPlaybackState(
  state: "playing" | "paused" | "none",
): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }
  navigator.mediaSession.playbackState = state;
}

/**
 * Register Media Session action handlers. Must be called once after first
 * user interaction. The handlers wire directly to the audioPlayer singleton.
 */
export function setupMediaSessionHandlers(): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  const ms = navigator.mediaSession;

  ms.setActionHandler("play", () => {
    void audioPlayer.play();
  });

  ms.setActionHandler("pause", () => {
    audioPlayer.pause();
  });

  ms.setActionHandler("stop", () => {
    audioPlayer.stop();
  });

  ms.setActionHandler("seekbackward", (details) => {
    const offset = details.seekOffset ?? 15;
    audioPlayer.skipBackward(offset);
  });

  ms.setActionHandler("seekforward", (details) => {
    const offset = details.seekOffset ?? 15;
    audioPlayer.skipForward(offset);
  });

  ms.setActionHandler("previoustrack", () => {
    // Phase 4: implement previous-track logic in player store
    audioPlayer.skipBackward(15);
  });

  ms.setActionHandler("nexttrack", () => {
    void audioPlayer.playNext();
  });

  // Some browsers support seekto — wire it up if available
  try {
    ms.setActionHandler("seekto", (details) => {
      if (details.seekTime != null) {
        audioPlayer.seek(details.seekTime);
      }
    });
  } catch {
    // Not supported — ignore
  }
}

/**
 * One-time setup — call after first user interaction.
 * Returns true if Media Session is available, false otherwise.
 */
export function initMediaSession(): boolean {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
    return false;
  }
  setupMediaSessionHandlers();
  return true;
}
