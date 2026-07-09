import { SEED_CLIPS, SEED_AUDIO_FILES, SEED_TRIPS } from "@/lib/seed-data";
import { ROADS } from "@/lib/wheatbelt-towns";
import { getDb } from "./db";
import { markClipAudioReady } from "./clips";
import { hasAudio, putAudio } from "./audio";
import { putClips } from "./clips";
import { putTrips } from "./trips";
import { putRoads } from "./roads";

/**
 * Seed the database on first run:
 *   1. Insert seed trips + clips + roads (if not already present)
 *   2. Download audio MP3s from /public/audio/ and ingest as blobs
 *   3. Mark clips as audioReady
 *
 * Idempotent — safe to call on every app start. Skips items already present.
 *
 * Returns a summary object for UI feedback.
 */

const SEED_VERSION_KEY = "seed-version";
const CURRENT_SEED_VERSION = 2;

export interface SeedResult {
  tripsSeeded: number;
  clipsSeeded: number;
  audioDownloaded: number;
  audioSkipped: number;
  audioErrors: string[];
}

export async function seedIfNeeded(force = false): Promise<SeedResult> {
  const db = await getDb();

  // Check seed version
  if (!force) {
    const version = (await db.get("kv", SEED_VERSION_KEY)) as number | undefined;
    if (version === CURRENT_SEED_VERSION) {
      return {
        tripsSeeded: 0,
        clipsSeeded: 0,
        audioDownloaded: 0,
        audioSkipped: 0,
        audioErrors: [],
      };
    }
  }

  // 1. Trips + clips + roads
  await putTrips(SEED_TRIPS);
  await putClips(SEED_CLIPS);
  await putRoads(Object.values(ROADS));

  // 2. Audio — fetch each MP3 from /public/audio/ and store as blob
  let audioDownloaded = 0;
  let audioSkipped = 0;
  const audioErrors: string[] = [];

  for (const clip of SEED_CLIPS) {
    const filename = SEED_AUDIO_FILES[clip.id];
    if (!filename) continue;

    const audioId = clip.id;

    // Skip if already present
    if (await hasAudio(audioId)) {
      audioSkipped++;
      await markClipAudioReady(clip.id, audioId);
      continue;
    }

    try {
      const response = await fetch(`/audio/${filename}`);
      if (!response.ok) {
        // 404 is OK in dev before seed-audio script runs — skip silently
        if (response.status === 404) {
          audioSkipped++;
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      await putAudio(audioId, blob);
      await markClipAudioReady(clip.id, audioId);
      audioDownloaded++;
    } catch (err) {
      audioErrors.push(`${filename}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3. Update seed version
  await db.put("kv", CURRENT_SEED_VERSION, SEED_VERSION_KEY);

  return {
    tripsSeeded: SEED_TRIPS.length,
    clipsSeeded: SEED_CLIPS.length,
    audioDownloaded,
    audioSkipped,
    audioErrors,
  };
}

/** Re-download audio for all seed clips (used by "Refresh audio" button). */
export async function refreshSeedAudio(): Promise<SeedResult> {
  const db = await getDb();
  // Clear audio store + reset clip audioReady flags
  await db.clear("audio");

  // Re-run seed (force = true skips the version check)
  return seedIfNeeded(true);
}
