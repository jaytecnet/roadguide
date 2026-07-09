import type { Road, RoadId } from "@/lib/types";
import { getDb } from "./db";

/**
 * Road geometry store. In Phase 3 this is populated by the MRWA Layer 17
 * download script (`scripts/fetch-mrwa-roads.ts`). For the MVP, seed roads
 * are stored here so the test-mode UI has geometry to work with.
 */

export async function getRoad(id: RoadId): Promise<Road | undefined> {
  const db = await getDb();
  return db.get("roads", id);
}

export async function getAllRoads(): Promise<Road[]> {
  const db = await getDb();
  return db.getAll("roads");
}

export async function putRoad(road: Road): Promise<void> {
  const db = await getDb();
  await db.put("roads", road);
}

export async function putRoads(roads: Road[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("roads", "readwrite");
  await Promise.all(roads.map((r) => tx.store.put(r)));
  await tx.done;
}
