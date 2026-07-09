import type {
  Clip,
  GeofenceTrigger,
  SlkRangeTrigger,
  TriggerEvaluation,
  TriggerSpec,
  VehiclePosition,
} from "@/lib/types";

/**
 * Trigger engine — evaluates the current vehicle position against all clips
 * for the active trip, returning which clips should fire and which should clear.
 *
 * Two trigger types share the same evaluation interface:
 *   1. SLK-range     — fires when on a specific road, between two SLK values,
 *                      travelling in a specific direction. Carriageway-aware.
 *   2. Geofence      — fires when within radius M of a lat/lon point.
 *
 * Both types use the same VehiclePosition input. The engine falls back to
 * lat/lon matching when SLK is unavailable, so geofences work in test mode
 * even before MRWA geometry is loaded.
 */

export interface TriggerEngine {
  /**
   * Evaluate the current position against the given clips.
   * Returns the set of clips whose triggers currently match, plus the set of
   * previously-matched clip ids that no longer match (for cleanup).
   */
  evaluate(position: VehiclePosition, clips: Clip[]): TriggerEvaluation;
}

/** A single trigger's match function. */
type Matcher = (
  trigger: TriggerSpec,
  position: VehiclePosition,
) => boolean;

/** Haversine distance in metres between two lat/lon points. */
export function haversineMetres(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** SLK-range matcher — carriageway-aware. */
const matchSlkRange: Matcher = (trigger, position) => {
  if (trigger.type !== "slk-range") return false;
  const t = trigger as SlkRangeTrigger;

  // Need road + SLK + direction from the position
  if (!position.roadId || position.slk == null || !position.direction) {
    return false;
  }

  // Road must match
  if (position.roadId !== t.roadId) return false;

  // Direction must match (carriageway awareness — critical for dual carriageways)
  if (position.direction !== t.direction) return false;

  // SLK must be within range
  const slk = position.slk;
  const lo = Math.min(t.slkStart, t.slkEnd);
  const hi = Math.max(t.slkStart, t.slkEnd);
  return slk >= lo && slk <= hi;
};

/** Geofence matcher — works from raw lat/lon, no SLK needed. */
const matchGeofence: Matcher = (trigger, position) => {
  if (trigger.type !== "geofence") return false;
  const t = trigger as GeofenceTrigger;
  if (position.lat == null || position.lon == null) return false;

  const dist = haversineMetres(position.lat, position.lon, t.lat, t.lon);
  return dist <= t.radiusM;
};

const MATCHERS: Matcher[] = [matchSlkRange, matchGeofence];

/** Test whether a single trigger matches a position. */
export function triggerMatches(
  trigger: TriggerSpec,
  position: VehiclePosition,
): boolean {
  return MATCHERS.some((m) => m(trigger, position));
}

/**
 * Evaluate all clips for a position. `previouslyMatched` is the set of clip
 * ids that were matched on the previous evaluation — used to compute the
 * "cleared" set.
 */
export function evaluateTriggers(
  position: VehiclePosition,
  clips: Clip[],
  previouslyMatched: Set<string> = new Set(),
): TriggerEvaluation {
  const matched = clips.filter((clip) =>
    triggerMatches(clip.trigger, position),
  );
  const matchedIds = new Set(matched.map((c) => c.id));
  const cleared = [...previouslyMatched].filter((id) => !matchedIds.has(id));

  return { matched, cleared };
}
