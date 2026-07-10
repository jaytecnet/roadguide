/**
 * For each town in wheatbelt-towns.ts, find the nearest segment of the
 * corresponding M031 road geometry and report the SLK position.
 *
 * This calibrates the seed data so town SLK values match MRWA's actual
 * SLK referencing — without this, triggers fire at the wrong geographic
 * positions.
 *
 * Run via: bun run scripts/calibrate-town-slks.ts
 * Output: prints updated TownMarker[] to paste into wheatbelt-towns.ts
 */

import { readFile } from "fs/promises";
import { join } from "path";

interface GeoJsonFeature {
  properties: {
    slkStart: number;
    slkEnd: number;
    commonName: string;
  };
  geometry: {
    coordinates: number[][][]; // MultiLineString
  };
}

interface GeoJsonCollection {
  roadId: string;
  features: GeoJsonFeature[];
}

interface Town {
  name: string;
  lat: number;
  lon: number;
  currentSlk: number;
}

const TOWNS: Town[] = [
  { name: "York",          lat: -31.8977, lon: 116.7664, currentSlk: 0 },
  { name: "Beverley",      lat: -32.1089, lon: 116.6426, currentSlk: 22 },
  { name: "Brookton",      lat: -32.3672, lon: 117.0036, currentSlk: 56 },
  { name: "Pingelly",      lat: -32.5319, lon: 117.0839, currentSlk: 86 },
  { name: "Narrogin",      lat: -32.9306, lon: 117.1783, currentSlk: 110 },
  { name: "Wagin",         lat: -33.3104, lon: 117.3431, currentSlk: 144 },
  { name: "Katanning",     lat: -33.6897, lon: 117.5525, currentSlk: 188 },
];

/** Distance from point (lat, lon) to a polyline segment in metres (Haversine). */
function distanceToSegment(
  lat: number,
  lon: number,
  segStartLat: number,
  segStartLon: number,
  segEndLat: number,
  segEndLon: number,
): { distance: number; projectedLat: number; projectedLon: number; t: number } {
  // Approximate as flat-earth — fine for short segments (< 1 km)
  const x = lon;
  const y = lat;
  const x1 = segStartLon;
  const y1 = segStartLat;
  const x2 = segEndLon;
  const y2 = segEndLat;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const segLenSq = dx * dx + dy * dy;

  let t = 0;
  if (segLenSq > 0) {
    t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / segLenSq));
  }

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  // Haversine distance from point to projection
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(projY - lat);
  const dLon = toRad(projX - lon);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat)) * Math.cos(toRad(projY)) * Math.sin(dLon / 2) ** 2;
  const distance = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return { distance, projectedLat: projY, projectedLon: projX, t };
}

async function main() {
  const roadPath = join(import.meta.dir, "..", "public", "roads", "M031.json");
  const raw = await readFile(roadPath, "utf-8");
  const collection = JSON.parse(raw) as GeoJsonCollection;

  console.log(`Road: ${collection.roadId} (${collection.features.length} segments)`);
  console.log(`\nCalibrating ${TOWNS.length} towns:\n`);

  const results: Array<{ town: Town; slk: number; commonName: string; distance: number }> = [];

  for (const town of TOWNS) {
    let bestDistance = Infinity;
    let bestFeature: GeoJsonFeature | null = null;
    let bestT = 0;

    for (const feat of collection.features) {
      for (const path of feat.geometry.coordinates) {
        for (let i = 0; i < path.length - 1; i++) {
          // path points are [lon, lat]
          const [startLon, startLat] = path[i];
          const [endLon, endLat] = path[i + 1];
          const { distance, t } = distanceToSegment(
            town.lat,
            town.lon,
            startLat,
            startLon,
            endLat,
            endLon,
          );
          if (distance < bestDistance) {
            bestDistance = distance;
            bestFeature = feat;
            bestT = t;
          }
        }
      }
    }

    if (!bestFeature) {
      console.log(`  ${town.name}: no segment found`);
      continue;
    }

    // Interpolate SLK along the segment
    const slkStart = bestFeature.properties.slkStart;
    const slkEnd = bestFeature.properties.slkEnd;
    const interpolatedSlk = slkStart + bestT * (slkEnd - slkStart);

    results.push({
      town,
      slk: interpolatedSlk,
      commonName: bestFeature.properties.commonName,
      distance: bestDistance,
    });

    console.log(
      `  ${town.name.padEnd(12)} SLK ${interpolatedSlk.toFixed(2).padStart(7)} km  ` +
      `(was ${town.currentSlk.toString().padStart(5)}, Δ ${(interpolatedSlk - town.currentSlk).toFixed(2).padStart(6)})  ` +
      `${bestDistance.toFixed(0).padStart(5)} m off  ${bestFeature.properties.commonName}`,
    );
  }

  // Output pasteable TypeScript
  console.log("\n=== Paste into wheatbelt-towns.ts ===\n");
  console.log("const M031_TOWNS: TownMarker[] = [");
  for (const r of results) {
    console.log(
      `  { slk: ${r.slk.toFixed(2)}, name: "${r.town.name}", lat: ${r.town.lat}, lon: ${r.town.lon}, blurb: "" },`,
    );
  }
  console.log("];");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
