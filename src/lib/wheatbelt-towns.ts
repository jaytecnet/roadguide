import type { Road, RoadId, TownMarker } from "./types";

/**
 * Wheatbelt road + town metadata.
 *
 * SLK positions are approximate placeholders for the MVP — Phase 3 will
 * replace these with real MRWA Layer 17 geometry. Town lat/lon values are
 * real coordinates so the geofence triggers work correctly in test mode
 * (and will work in real GPS mode once Phase 3 ships).
 *
 * The user selected "Other" for their usual route and will specify it later;
 * this M031 seed is a placeholder so the architecture can be exercised end-to-end.
 * Swap these for the user's real route any time — the rest of the app is
 * route-agnostic.
 */

// --- Great Southern Hwy (M031) — York to Katanning corridor -----------------

/*
 * SLK positions calibrated against MRWA Layer 17 M031 geometry via
 * scripts/calibrate-town-slks.ts. Beverley sits ~17 km west of M031
 * (it's on a spur road) so its SLK is the nearest point on M031 —
 * the user's real route may not actually pass through Beverley on M031.
 * Re-calibrate when the user provides their actual route.
 */
const M031_TOWNS: TownMarker[] = [
  {
    slk: 35.66,
    name: "York",
    lat: -31.8977,
    lon: 116.7664,
    blurb:
      "Inland's first town (1831). Settled before Perth was anything more than a riverbank camp, York became the staging point for every Eastern Districts expedition. The motor museum now occupies the old motor garage on Avon Terrace — look for the pressed-tin ceiling.",
  },
  {
    slk: 51.04,
    name: "Beverley",
    lat: -32.1089,
    lon: 116.6426,
    blurb:
      "Avon River crossing. The Beverley Soaring Society is one of the oldest gliding clubs in Australia — if you see circling sailplanes on a summer afternoon, that's them riding thermals off the bare paddocks.",
  },
  {
    slk: 97.51,
    name: "Brookton",
    lat: -32.3672,
    lon: 117.0036,
    blurb:
      "Junction with Brookton Highway, the back route into Perth. The Old Police Station museum is open by appointment — ask at the shire office if you want a look through.",
  },
  {
    slk: 117.7,
    name: "Pingelly",
    lat: -32.5319,
    lon: 117.0839,
    blurb:
      "Wheatbelt sheep country. The Pingelly Recreation and Cultural Centre hosts the annual Pingelly Astrofest — some of the darkest skies in the southwest, only two hours from Perth.",
  },
  {
    slk: 167.41,
    name: "Narrogin",
    lat: -32.9306,
    lon: 117.1783,
    blurb:
      "Regional crossroads. Narrogin was the railhead for the Great Southern line and still has the operational grain pools. Dryandra Forest nearby is one of the last strongholds of the numbat.",
  },
  {
    slk: 216.31,
    name: "Wagin",
    lat: -33.3104,
    lon: 117.3431,
    blurb:
      "Home of the Giant Ram — a 7-metre fibreglass merino built in 1985. The Wagin Woolorama, held every March, is one of the biggest sheep shows in WA.",
  },
  {
    slk: 269.83,
    name: "Katanning",
    lat: -33.6897,
    lon: 117.5525,
    blurb:
      "End of the M031 for this trip. Katanning's Kobeelya was a finishing school for the daughters of pastoralists; the flour mill on Clive Street is being restored as a visitor centre.",
  },
];

// --- Off-SLK geofence POIs along M031 ----------------------------------------

/**
 * Points of interest that sit off the M031 corridor itself — lookouts,
 * historical markers, side-trips. These use geofence triggers (lat/lon
 * radius) rather than SLK ranges.
 */
const M031_OFFROAD_POIS: Array<{
  name: string;
  lat: number;
  lon: number;
  radiusM: number;
  blurb: string;
}> = [
  {
    name: "Mount Brown Lookout",
    lat: -31.8836,
    lon: 116.7833,
    radiusM: 500,
    blurb:
      "Just outside York. Panoramic view of the Avon Valley — best at sunset when the granite outcrops go orange.",
  },
  {
    name: "Dryandra Forest Settlement",
    lat: -32.7667,
    lon: 117.0333,
    radiusM: 800,
    blurb:
      "Barna Mia nocturnal animal sanctuary — book ahead for the guided spotlight walk to see bilbies, boodies, and woylies.",
  },
];

// --- Road registry -----------------------------------------------------------

export const ROADS: Record<RoadId, Road> = {
  M031: {
    id: "M031",
    name: "Great Southern Highway (Peel Terrace / Northam-York Rd corridor)",
    lengthKm: 352.23,
    slkStart: 0,
    slkEnd: 352.23,
    towns: M031_TOWNS,
    // Phase 3: geometry loaded from /public/roads/M031.json into IndexedDB on first run
  },
};

export const OFFROAD_POIS = M031_OFFROAD_POIS;

/** Get a road by id, throwing if it doesn't exist (programming error). */
export function getRoad(roadId: RoadId): Road {
  const road = ROADS[roadId];
  if (!road) throw new Error(`Unknown road: ${roadId}`);
  return road;
}

/** Find the nearest town marker on a road for a given SLK. */
export function nearestTown(roadId: RoadId, slk: number): TownMarker | null {
  const road = ROADS[roadId];
  if (!road || road.towns.length === 0) return null;
  return road.towns.reduce((best, town) =>
    Math.abs(town.slk - slk) < Math.abs(best.slk - slk) ? town : best,
  );
}
