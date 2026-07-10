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

/**
 * Initial bearing from point 1 to point 2, in degrees (0 = north, 90 = east).
 * Returns 0–360.
 */
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Angular difference between two bearings, in degrees (0–180). */
export function bearingDiff(b1: number, b2: number): number {
  const diff = Math.abs(b1 - b2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/** SLK-range matcher — carriageway-aware. Used only for corridor callouts. */
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

/**
 * Geofence matcher — works from raw lat/lon, no SLK needed.
 * Primary trigger type for all POIs.
 *
 * Directional filter (if set):
 *   - "arriving"  — fires only when GPS heading is toward the POI
 *                   (bearing to POI within 90° of GPS heading)
 *   - "departing" — fires only when GPS heading is away from the POI
 *                   (bearing to POI more than 90° off GPS heading)
 *
 * Direction check is skipped if:
 *   - No direction field is set on the trigger (most POIs)
 *   - GPS heading is NaN (stationary — let it fire, user can skip if unwanted)
 */
const matchGeofence: Matcher = (trigger, position) => {
  if (trigger.type !== "geofence") return false;
  const t = trigger as GeofenceTrigger;
  if (position.lat == null || position.lon == null) return false;

  // Distance check
  const dist = haversineMetres(position.lat, position.lon, t.lat, t.lon);
  if (dist > t.radiusM) return false;

  // Directional filter
  if (t.direction && position.headingDeg != null && !Number.isNaN(position.headingDeg)) {
    const bearing = bearingDeg(position.lat, position.lon, t.lat, t.lon);
    const diff = bearingDiff(position.headingDeg, bearing);
    if (t.direction === "arriving" && diff > 90) return false;
    if (t.direction === "departing" && diff <= 90) return false;
  }

  return true;
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
