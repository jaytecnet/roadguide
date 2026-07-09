import { getDb } from "./db";

/** Store an audio blob in IndexedDB, keyed by audioId. */
export async function putAudio(
  audioId: string,
  blob: Blob,
): Promise<void> {
  const db = await getDb();
  await db.put("audio", {
    id: audioId,
    blob,
    size: blob.size,
    createdAt: Date.now(),
  });
}

/** Get an audio blob by id. Returns a Blob suitable for `URL.createObjectURL`. */
export async function getAudio(
  audioId: string,
): Promise<Blob | undefined> {
  const db = await getDb();
  const record = await db.get("audio", audioId);
  return record?.blob;
}

/** Check whether audio for a clip has been downloaded. */
export async function hasAudio(audioId: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.count("audio", audioId);
  return count > 0;
}

/** Delete a single audio blob. */
export async function deleteAudio(audioId: string): Promise<void> {
  const db = await getDb();
  await db.delete("audio", audioId);
}

/** Total size of all stored audio blobs, in bytes. */
export async function totalAudioSize(): Promise<number> {
  const db = await getDb();
  let total = 0;
  let cursor = await db.transaction("audio").store.openCursor();
  while (cursor) {
    total += cursor.value.size;
    cursor = await cursor.continue();
  }
  return total;
}

/** List all audio ids currently in storage (for cache management UI). */
export async function listAudioIds(): Promise<string[]> {
  const db = await getDb();
  return db.getAllKeys("audio");
}

/**
 * Create an object URL for a stored audio blob. Caller is responsible for
 * revoking the URL via `URL.revokeObjectURL` when done.
 */
export async function createAudioUrl(audioId: string): Promise<string | null> {
  const blob = await getAudio(audioId);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}
