import type { Clip } from "@/lib/types";
import { getDb } from "./db";

/** Get all clips for a trip, ordered by `order`. */
export async function getClipsForTrip(tripId: string): Promise<Clip[]> {
  const db = await getDb();
  const clips = await db.getAllFromIndex("clips", "by-tripId", tripId);
  return clips.sort((a, b) => a.order - b.order);
}

/** Get a single clip by id. */
export async function getClip(id: string): Promise<Clip | undefined> {
  const db = await getDb();
  return db.get("clips", id);
}

/** Insert or update a clip. */
export async function putClip(clip: Clip): Promise<void> {
  const db = await getDb();
  await db.put("clips", clip);
}

/** Bulk insert clips (used by seeding). */
export async function putClips(clips: Clip[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("clips", "readwrite");
  await Promise.all(clips.map((c) => tx.store.put(c)));
  await tx.done;
}

/** Mark a clip's audio as ready (downloaded/generated). */
export async function markClipAudioReady(
  clipId: string,
  audioId: string,
  durationSec?: number,
): Promise<void> {
  const db = await getDb();
  const clip = await db.get("clips", clipId);
  if (!clip) return;
  await db.put("clips", {
    ...clip,
    audioId,
    audioReady: true,
    durationSec: durationSec ?? clip.durationSec,
  });
}

/** Mark a clip's audio as not ready (e.g. after audio is deleted). */
export async function markClipAudioNotReady(clipId: string): Promise<void> {
  const db = await getDb();
  const clip = await db.get("clips", clipId);
  if (!clip) return;
  await db.put("clips", {
    ...clip,
    audioId: undefined,
    audioReady: false,
    durationSec: undefined,
  });
}

/** Delete a clip + its associated audio blob. */
export async function deleteClip(clipId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["clips", "audio"], "readwrite");
  await tx.objectStore("clips").delete(clipId);
  await tx.objectStore("audio").delete(clipId);
  await tx.done;
}

/** Create a new clip with a generated id. Returns the created clip. */
export async function createClip(
  tripId: string,
  partial: Partial<Clip>,
): Promise<Clip> {
  const db = await getDb();
  // Find the max order for this trip to append at the end
  const existing = await db.getAllFromIndex("clips", "by-tripId", tripId);
  const maxOrder = existing.reduce((max, c) => Math.max(max, c.order), -1);

  const clip: Clip = {
    id: partial.id ?? `clip-custom-${Date.now()}`,
    tripId,
    title: partial.title ?? "New clip",
    subtitle: partial.subtitle,
    script: partial.script ?? "",
    durationSec: partial.durationSec,
    trigger: partial.trigger ?? {
      type: "geofence",
      lat: -31.8977,
      lon: 116.7664,
      radiusM: 300,
    },
    audioId: partial.audioId,
    audioReady: partial.audioReady ?? false,
    order: partial.order ?? maxOrder + 1,
  };

  await db.put("clips", clip);
  return clip;
}
