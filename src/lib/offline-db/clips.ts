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
