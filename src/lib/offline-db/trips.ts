import type { Trip } from "@/lib/types";
import { getDb } from "./db";

/** Get all trips, ordered by most recently updated. */
export async function getAllTrips(): Promise<Trip[]> {
  const db = await getDb();
  const trips = await db.getAllFromIndex("trips", "by-updatedAt");
  return trips.reverse();
}

/** Get a single trip by id. */
export async function getTrip(id: string): Promise<Trip | undefined> {
  const db = await getDb();
  return db.get("trips", id);
}

/** Insert or update a trip. */
export async function putTrip(trip: Trip): Promise<void> {
  const db = await getDb();
  await db.put("trips", trip);
}

/** Bulk insert trips (used by seeding). */
export async function putTrips(trips: Trip[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("trips", "readwrite");
  await Promise.all(trips.map((t) => tx.store.put(t)));
  await tx.done;
}

/** Delete a trip and all its clips + audio. */
export async function deleteTrip(id: string): Promise<void> {
  const db = await getDb();
  // First gather clips so we can clean audio store
  const clipIds = await db.getAllKeysFromIndex("clips", "by-tripId", id);
  const tx = db.transaction(["trips", "clips", "audio"], "readwrite");
  await tx.objectStore("trips").delete(id);
  for (const clipId of clipIds) {
    await tx.objectStore("clips").delete(clipId);
    await tx.objectStore("audio").delete(clipId);
  }
  await tx.done;
}
