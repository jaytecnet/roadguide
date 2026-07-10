/**
 * Fetch MRWA Layer 17 road geometry for a specific road ID.
 *
 * Queries the ArcGIS REST API in chunks (resultOffset pagination, since
 * the server caps resultRecordCount at typically 1000-2000 features per
 * request), assembles all segments into a single GeoJSON FeatureCollection,
 * and writes to /public/roads/<roadId>.json.
 *
 * Run via:
 *   bun run scripts/fetch-mrwa-roads.ts M010
 *   bun run scripts/fetch-mrwa-roads.ts H005
 *
 * Output:
 *   public/roads/M010.json — GeoJSON FeatureCollection with one Feature per
 *   segment. Each feature's properties include ROAD, START_SLK, END_SLK,
 *   CWY, COMMON_USAGE_NAME, NETWORK_TYPE.
 *
 * After running, the app ingests this file into IndexedDB on first load
 * (see src/lib/offline-db/seed.ts).
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const BASE =
  "https://gisservices.mainroads.wa.gov.au/arcgis/rest/services/OpenData/RoadAssets_DataPortal/MapServer/17";

const PAGE_SIZE = 1000; // features per request
const MAX_PAGES = 50; // safety cap

interface ArcGisFeature {
  attributes: Record<string, unknown>;
  geometry: { paths: number[][][]; spatialReference?: { wkid: number } };
}

interface ArcGisQueryResponse {
  features: ArcGisFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string; details?: unknown[] };
}

async function fetchPage(
  roadId: string,
  offset: number,
): Promise<ArcGisQueryResponse> {
  const outFields = [
    "ROAD",
    "ROAD_NAME",
    "COMMON_USAGE_NAME",
    "START_SLK",
    "END_SLK",
    "CWY",
    "START_TRUE_DIST",
    "END_TRUE_DIST",
    "NETWORK_TYPE",
  ].join(",");

  const params = new URLSearchParams({
    f: "json",
    where: `ROAD='${roadId}'`,
    outFields,
    returnGeometry: "true",
    orderByFields: "START_SLK",
    resultRecordCount: String(PAGE_SIZE),
    resultOffset: String(offset),
    // Simplify geometry slightly to keep file size reasonable —
    // 0.0001 degrees ≈ 11m at this latitude, plenty for road matching
    maxAllowableOffset: "0.00005",
  });

  const url = `${BASE}/query?${params}`;
  console.log(`  GET page @ offset ${offset}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as ArcGisQueryResponse;
}

interface GeoJsonFeature {
  type: "Feature";
  geometry: {
    type: "MultiLineString";
    coordinates: number[][][];
  };
  properties: Record<string, unknown>;
}

function toGeoJson(arcFeature: ArcGisFeature): GeoJsonFeature {
  const paths = arcFeature.geometry.paths ?? [];
  return {
    type: "Feature",
    geometry: {
      type: "MultiLineString",
      // ArcGIS returns [lon, lat] pairs — same as GeoJSON
      coordinates: paths,
    },
    properties: {
      roadId: arcFeature.attributes.ROAD,
      roadName: arcFeature.attributes.ROAD_NAME,
      commonName: arcFeature.attributes.COMMON_USAGE_NAME,
      slkStart: arcFeature.attributes.START_SLK,
      slkEnd: arcFeature.attributes.END_SLK,
      cwy: arcFeature.attributes.CWY,
      trueDistStart: arcFeature.attributes.START_TRUE_DIST,
      trueDistEnd: arcFeature.attributes.END_TRUE_DIST,
      networkType: arcFeature.attributes.NETWORK_TYPE,
    },
  };
}

async function main() {
  const roadId = process.argv[2];
  if (!roadId) {
    console.error("Usage: bun run scripts/fetch-mrwa-roads.ts <ROAD_ID>");
    console.error('Example: bun run scripts/fetch-mrwa-roads.ts M010');
    process.exit(1);
  }

  const outDir = join(import.meta.dir, "..", "public", "roads");
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }
  const outPath = join(outDir, `${roadId}.json`);

  console.log(`Fetching MRWA Layer 17 geometry for road ${roadId}...`);

  const allFeatures: GeoJsonFeature[] = [];
  let offset = 0;
  let totalPages = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchPage(roadId, offset);
    if (result.error) {
      console.error("MRWA API error:", result.error);
      process.exit(1);
    }

    const pageFeatures = result.features.map(toGeoJson);
    allFeatures.push(...pageFeatures);
    totalPages++;
    console.log(
      `    got ${pageFeatures.length} features (total: ${allFeatures.length})`,
    );

    // If fewer than PAGE_SIZE returned OR no exceededTransferLimit flag, we're done
    if (!result.exceededTransferLimit && pageFeatures.length < PAGE_SIZE) {
      break;
    }
    offset += PAGE_SIZE;
  }

  // Sort features by SLK start (defensive — the orderByFields should already do this)
  allFeatures.sort((a, b) => {
    const aSlk = (a.properties.slkStart as number) ?? 0;
    const bSlk = (b.properties.slkStart as number) ?? 0;
    return aSlk - bSlk;
  });

  // Compute summary stats for sanity
  const slkStarts = allFeatures.map((f) => f.properties.slkStart as number);
  const slkEnds = allFeatures.map((f) => f.properties.slkEnd as number);
  const minSlk = slkStarts.length > 0 ? Math.min(...slkStarts) : 0;
  const maxSlk = slkEnds.length > 0 ? Math.max(...slkEnds) : 0;
  const cwyCounts = allFeatures.reduce(
    (acc, f) => {
      const c = (f.properties.cwy as string) ?? "?";
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const collection = {
    type: "FeatureCollection" as const,
    roadId,
    roadName: allFeatures[0]?.properties.roadName ?? "Unknown",
    commonName: allFeatures[0]?.properties.commonName ?? "Unknown",
    slkRange: { start: minSlk, end: maxSlk },
    segmentCount: allFeatures.length,
    carriageways: cwyCounts,
    fetchedAt: new Date().toISOString(),
    features: allFeatures,
  };

  await writeFile(outPath, JSON.stringify(collection, null, 2));
  console.log(`\n=== Summary ===`);
  console.log(`Road: ${roadId} (${collection.commonName})`);
  console.log(`Segments: ${allFeatures.length} (${totalPages} page(s))`);
  console.log(`SLK range: ${minSlk} – ${maxSlk} km`);
  console.log(`Carriageways: ${JSON.stringify(cwyCounts)}`);
  console.log(`Output: ${outPath}`);
  console.log(`Size: ${(JSON.stringify(collection).length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
