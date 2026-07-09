/**
 * Core domain types for the Wheatbelt Road Trip Audio Companion.
 *
 * All road / SLK terminology follows Main Roads Western Australia (MRWA)
 * conventions:
 *   - SLK = Straight Line Kilometre — single increasing measure along a road
 *     from its defined start point.
 *   - Carriageway direction:
 *       True Left  / Left Carriageway  = traffic moving INCREASING SLK
 *       True Right / Right Carriageway = traffic moving DECREASING SLK
 *     (Australian left-hand driving convention.)
 */

/** MRWA road identifier, e.g. "M031" (Great Southern Hwy), "H005" (Great Eastern Hwy). */
export type RoadId = string;

/** Direction of travel along a road, expressed via SLK progression. */
export type SlkDirection = "increasing" | "decreasing";

/** A trip is a switchable playlist of clips bound to one or more roads. */
export interface Trip {
  id: string;
  /** Human-readable name, e.g. "Great Southern Hwy — York to Katanning". */
  name: string;
  /** Short description shown in the trip switcher. */
  description: string;
  /** Roads this trip traverses. Clips reference these by id. */
  roadIds: RoadId[];
  /** Optional accent colour for UI theming per trip. */
  accent?: string;
  /** ISO timestamp of last modification. */
  updatedAt: number;
  /** Whether this trip has been downloaded for offline use. */
  downloaded: boolean;
}

/** A road with SLK geometry. Phase 3 populates this from MRWA Layer 17. */
export interface Road {
  id: RoadId;
  /** Official MRWA road name. */
  name: string;
  /** Total length in kilometres (SLK end - SLK start). */
  lengthKm: number;
  /** SLK start (usually 0). */
  slkStart: number;
  /** SLK end. */
  slkEnd: number;
  /** Towns located along this road, keyed by SLK position. */
  towns: TownMarker[];
  /** Polyline of [lat, lon] pairs — populated in Phase 3 from MRWA Layer 17. */
  geometry?: [number, number][];
}

/** A town or notable point located at a specific SLK on a road. */
export interface TownMarker {
  /** SLK position along the parent road. */
  slk: number;
  /** Town name. */
  name: string;
  /** Lat/lon for map context and geofence fallback. */
  lat: number;
  lon: number;
  /** Short blurb shown in UI. */
  blurb?: string;
}

/**
 * A clip is a single audio commentary segment, triggered either by an SLK range
 * on a specific road, or by a geofence around a lat/lon point.
 */
export interface Clip {
  id: string;
  /** Trip this clip belongs to. */
  tripId: string;
  /** Display title — usually the town or POI name. */
  title: string;
  /** Short subtitle, e.g. "Founded 1831 · Population 2,500". */
  subtitle?: string;
  /** Long-form transcript / narration script. */
  script: string;
  /** Duration in seconds (populated after audio is generated/loaded). */
  durationSec?: number;
  /** Trigger specification — one of these must be present. */
  trigger: SlkRangeTrigger | GeofenceTrigger;
  /** IndexedDB key for the audio blob. */
  audioId?: string;
  /** Whether the audio blob has been downloaded/generated. */
  audioReady: boolean;
  /** Sort order within the trip (for queueing). */
  order: number;
}

/**
 * SLK-range trigger: fire when the vehicle is on `roadId` between
 * `slkStart` and `slkEnd`, travelling in `direction`.
 *
 * Carriageway awareness is critical — a clip keyed to "M031 SLK 60-65
 * increasing" must NOT fire when the vehicle is on the right carriageway
 * (decreasing SLK), otherwise you get false triggers from oncoming traffic.
 */
export interface SlkRangeTrigger {
  type: "slk-range";
  roadId: RoadId;
  slkStart: number;
  slkEnd: number;
  direction: SlkDirection;
}

/**
 * Geofence trigger: fire when the vehicle is within `radiusM` metres of
 * (lat, lon). Used for off-SLK POIs like lookouts, historical markers,
 * and town side-trips.
 */
export interface GeofenceTrigger {
  type: "geofence";
  lat: number;
  lon: number;
  radiusM: number;
}

/** Union type for trigger specs. */
export type TriggerSpec = SlkRangeTrigger | GeofenceTrigger;

/** Discriminated union for trigger engine events. */
export type TriggerEvent =
  | { type: "trigger-fired"; clipId: string; trigger: TriggerSpec }
  | { type: "trigger-cleared"; clipId: string };

/** Current vehicle position — either real (GPS + EKF) or simulated (test mode). */
export interface VehiclePosition {
  /** Source of the position. */
  source: "gps" | "test";
  /** Road the vehicle is currently on, if matched. */
  roadId?: RoadId;
  /** SLK position along the road, if matched. */
  slk?: number;
  /** Direction of travel along the road. */
  direction?: SlkDirection;
  /** Raw lat/lon. */
  lat?: number;
  lon?: number;
  /** Speed in km/h (for EKF tuning context). */
  speedKmh?: number;
  /** ISO timestamp of the fix. */
  timestamp: number;
}

/** Result of a single trigger evaluation pass. */
export interface TriggerEvaluation {
  /** Clips whose triggers currently match the vehicle position. */
  matched: Clip[];
  /** Clips that were previously matched but are no longer (for cleanup). */
  cleared: string[];
}
