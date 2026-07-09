import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Clip, Road, Trip } from "@/lib/types";

/**
 * IndexedDB schema for the Wheatbelt Audio Companion.
 *
 * Modular structure mirrors the TC Work Zone Locator pattern — one file per
 * object store, all sharing this single DB connection.
 *
 * Stores:
 *   - trips       : Trip metadata
 *   - clips       : Clip metadata + trigger specs
 *   - audio       : MP3 blobs keyed by audioId (the clip id)
 *   - roads       : Road geometry (Phase 3 — MRWA Layer 17)
 *   - kv          : Misc key/value (settings, seed-version, etc.)
 */

const DB_NAME = "wheatbelt-audio";
const DB_VERSION = 1;

interface WheatbeltDB extends DBSchema {
  trips: {
    key: string;
    value: Trip;
    indexes: { "by-updatedAt": number };
  };
  clips: {
    key: string;
    value: Clip;
    indexes: { "by-tripId": string; "by-order": number };
  };
  audio: {
    key: string; // audioId (=== clip.id for seed data)
    value: { id: string; blob: Blob; size: number; createdAt: number };
  };
  roads: {
    key: string;
    value: Road;
  };
  kv: {
    key: string;
    value: unknown;
  };
}

let dbPromise: Promise<IDBPDatabase<WheatbeltDB>> | null = null;

/** Get the singleton DB connection. */
export function getDb(): Promise<IDBPDatabase<WheatbeltDB>> {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!dbPromise) {
    dbPromise = openDB<WheatbeltDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const trips = db.createObjectStore("trips", { keyPath: "id" });
        trips.createIndex("by-updatedAt", "updatedAt");

        const clips = db.createObjectStore("clips", { keyPath: "id" });
        clips.createIndex("by-tripId", "tripId");
        clips.createIndex("by-order", "order");

        db.createObjectStore("audio", { keyPath: "id" });
        db.createObjectStore("roads", { keyPath: "id" });
        db.createObjectStore("kv");
      },
    });
  }
  return dbPromise;
}

/** Drop everything — used by the "Reset cache" button in Settings. */
export async function wipeDb(): Promise<void> {
  const db = await getDb();
  await Promise.all([
    db.clear("trips"),
    db.clear("clips"),
    db.clear("audio"),
    db.clear("roads"),
    db.clear("kv"),
  ]);
}
