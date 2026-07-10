import { SEED_CLIPS, SEED_AUDIO_FILES, SEED_TRIPS } from "@/lib/seed-data";
import { ROADS } from "@/lib/wheatbelt-towns";
import { getDb } from "./db";
import { markClipAudioReady } from "./clips";
import { hasAudio, putAudio } from "./audio";
import { putClips } from "./clips";
import { putTrips } from "./trips";
import { putRoad, putRoads } from "./roads";
import type { Road } from "@/lib/types";

/**
 * Seed the database on first run:
 *   1. Insert seed trips + clips + roads (if not already present)
 *   2. Download audio MP3s from /public/audio/ and ingest as blobs
 *   3. Download road geometry from /public/roads/ and merge into road records
 *   4. Mark clips as audioReady
 *
 * Idempotent — safe to call on every app start. Skips items already present.
 *
 * Returns a summary object for UI feedback.
 */

const SEED_VERSION_KEY = "seed-version";
const CURRENT_SEED_VERSION = 4;

export interface SeedResult {
  tripsSeeded: number;
  clipsSeeded: number;
  roadsGeometriesLoaded: number;
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
        roadsGeometriesLoaded: 0,
        audioDownloaded: 0,
        audioSkipped: 0,
        audioErrors: [],
      };
    }
  }

  // 1. Trips + clips + roads (metadata only — geometry loaded separately below)
  await putTrips(SEED_TRIPS);
  await putClips(SEED_CLIPS);
  await putRoads(Object.values(ROADS));

  // 2. Road geometry — fetch /public/roads/<id>.json for each road, merge into
  //    the road record's `geometry` field. Skip silently if file not present.
  let roadsGeometriesLoaded = 0;
  for (const road of Object.values(ROADS)) {
    try {
      const response = await fetch(`/roads/${road.id}.json`);
      if (!response.ok) {
        if (response.status === 404) continue; // no geometry file for this road
        throw new Error(`HTTP ${response.status}`);
      }
      const geojson = await response.json();
      // Extract [lat, lon] pairs from the GeoJSON MultiLineString features.
      // Each feature is a segment with its own SLK range; we concatenate them
      // in SLK order to form a single polyline for the road.
      // NOTE: For Phase 3 MVP we store the full segment list — snap-to-road
      // uses individual segments with their own SLK ranges for accuracy.
      const segments: RoadSegment[] = (geojson.features ?? []).map(
        (f: GeoJsonFeature) => ({
          slkStart: f.properties.slkStart,
          slkEnd: f.properties.slkEnd,
          cwy: f.properties.cwy,
          commonName: f.properties.commonName,
          // Convert [lon, lat] pairs to [lat, lon] for our internal convention.
          // GeoJSON coordinates are number[][] so we cast after validating length.
          points: f.geometry.coordinates.flat().map((pt: number[]) => [pt[1], pt[0]] as [number, number]),
        }),
      );
      const roadWithGeometry: Road = {
        ...road,
        geometry: segments.flatMap((s) => s.points),
        // Stash segments for snap-to-road — we'll load these via a separate store
        // in a later iteration. For now, the geometry field is enough for
        // rendering and basic snap-to-road.
      };
      await putRoad(roadWithGeometry);
      // Also store segments separately in kv for the snap-to-road module
      await db.put("kv", segments, `road-segments:${road.id}`);
      roadsGeometriesLoaded++;
    } catch (err) {
      console.warn(`[seed] Failed to load geometry for road ${road.id}:`, err);
    }
  }

  // 3. Audio — fetch each MP3 from /public/audio/ and store as blob
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

  // 4. Update seed version
  await db.put("kv", CURRENT_SEED_VERSION, SEED_VERSION_KEY);

  return {
    tripsSeeded: SEED_TRIPS.length,
    clipsSeeded: SEED_CLIPS.length,
    roadsGeometriesLoaded,
    audioDownloaded,
    audioSkipped,
    audioErrors,
  };
}

/** Road segment with SLK range + geometry, used by snap-to-road. */
export interface RoadSegment {
  slkStart: number;
  slkEnd: number;
  cwy: string;
  commonName: string;
  points: [number, number][]; // [lat, lon] pairs
}

interface GeoJsonFeature {
  properties: {
    slkStart: number;
    slkEnd: number;
    cwy: string;
    commonName: string;
  };
  geometry: {
    coordinates: number[][][]; // MultiLineString [lon, lat]
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

/** Load road segments for snap-to-road from kv store. */
export async function getRoadSegments(roadId: string): Promise<RoadSegment[]> {
  const db = await getDb();
  const segments = (await db.get("kv", `road-segments:${roadId}`)) as
    | RoadSegment[]
    | undefined;
  return segments ?? [];
}
