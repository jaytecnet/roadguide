/**
 * Probe MRWA ArcGIS RoadInfo MapServer to discover:
 *   - Whether the endpoint is reachable from this environment
 *   - Layer 17 (State Road Network) field names + geometry type
 *   - Sample feature to confirm attribute schema
 *
 * Run via: bun run scripts/probe-mrwa.ts
 */

const BASE = "https://gisservices.mainroads.wa.gov.au/arcgis/rest/services/Projects/RoadInfo/MapServer";

async function fetchJson(url: string): Promise<unknown> {
  console.log(`GET ${url}`);
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function main() {
  // 1. Top-level service metadata
  console.log("\n=== Service metadata ===");
  try {
    const service = (await fetchJson(`${BASE}?f=json`)) as {
      layers?: Array<{ id: number; name: string; geometryType: string }>;
      error?: unknown;
    };
    if (service.error) {
      console.error("Service returned error:", JSON.stringify(service.error, null, 2));
      return;
    }
    console.log(`Layers: ${service.layers?.length ?? 0}`);
    if (service.layers) {
      for (const layer of service.layers.slice(0, 25)) {
        console.log(`  [${layer.id}] ${layer.name} (${layer.geometryType})`);
      }
    }
  } catch (err) {
    console.error("Failed to fetch service metadata:", err);
    return;
  }

  // 2. Layer 17 details
  console.log("\n=== Layer 17 (candidate State Road Network) ===");
  try {
    const layer = (await fetchJson(`${BASE}/17?f=json`)) as {
      name?: string;
      geometryType?: string;
      fields?: Array<{ name: string; alias: string; type: string }>;
      error?: unknown;
    };
    if (layer.error) {
      console.error("Layer 17 error:", JSON.stringify(layer.error, null, 2));
      return;
    }
    console.log(`Name: ${layer.name}`);
    console.log(`Geometry: ${layer.geometryType}`);
    console.log(`Fields (${layer.fields?.length ?? 0}):`);
    if (layer.fields) {
      for (const f of layer.fields) {
        console.log(`  - ${f.name} (${f.type}) — ${f.alias}`);
      }
    }
  } catch (err) {
    console.error("Failed to fetch layer 17:", err);
    return;
  }

  // 3. Sample feature — bounding box around York, WA
  // York: -31.8977, 116.7664
  // Use a small bbox: ~10km square
  const latMin = -32.0;
  const latMax = -31.8;
  const lonMin = 116.7;
  const lonMax = 116.85;
  // ArcGIS envelope format: xmin,ymin,xmax,ymax (lon,lat,lon,lat)
  const envelope = `${lonMin},${latMin},${lonMax},${latMax}`;

  console.log(`\n=== Sample query (bbox around York, WA) ===`);
  const queryUrl =
    `${BASE}/17/query?f=json` +
    `&geometry=${envelope}` +
    `&geometryType=esriGeometryEnvelope` +
    `&spatialRel=esriSpatialRelIntersects` +
    `&outFields=*` +
    `&returnGeometry=true` +
    `&maxAllowableOffset=0.0001` + // simplify geometry slightly
    `&resultRecordCount=5`;

  try {
    const result = (await fetchJson(queryUrl)) as {
      features?: Array<{
        attributes: Record<string, unknown>;
        geometry?: { paths?: number[][][] };
      }>;
      error?: unknown;
    };
    if (result.error) {
      console.error("Query error:", JSON.stringify(result.error, null, 2));
      return;
    }
    console.log(`Features returned: ${result.features?.length ?? 0}`);
    if (result.features && result.features.length > 0) {
      const f = result.features[0];
      console.log("\nSample feature attributes:");
      for (const [key, val] of Object.entries(f.attributes)) {
        console.log(`  ${key}: ${JSON.stringify(val)}`);
      }
      if (f.geometry?.paths && f.geometry.paths.length > 0) {
        const path = f.geometry.paths[0];
        console.log(`\nSample geometry: ${f.geometry.paths.length} path(s), first path has ${path.length} points`);
        console.log(`  First 3 points: ${JSON.stringify(path.slice(0, 3))}`);
      }
    }
  } catch (err) {
    console.error("Failed to query layer 17:", err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
