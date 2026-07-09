/**
 * One-time seed audio generation.
 *
 * Reads the seed-data.ts clip definitions, calls the z-ai-web-dev-sdk TTS
 * for each clip's script, and saves MP3 files to /public/audio/.
 *
 * Run via: `bun run scripts/generate-seed-audio.ts`
 *
 * After running, the MP3s are bundled with the app. On first client load,
 * the app fetches them from /audio/*.mp3 and ingests into IndexedDB.
 * After that, the app is fully offline.
 *
 * Voice choice: "tongtong" — warm, conversational. Matches the personal
 * road-trip-with-brother-in-laws vibe.
 */

import ZAI from "z-ai-web-dev-sdk";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

// --- Inline seed data (kept in sync with src/lib/seed-data.ts) -------------
// Inlined here so the script doesn't need to resolve TypeScript path aliases.

interface SeedClip {
  id: string;
  title: string;
  script: string;
}

const M031_TOWNS = [
  {
    slk: 0,
    name: "York",
    blurb:
      "York — inland Western Australia's first town, settled in 1831. Founded before Perth was anything more than a riverbank camp, York became the staging point for every Eastern Districts expedition. The motor museum now occupies the old motor garage on Avon Terrace. Look for the pressed-tin ceiling inside.",
  },
  {
    slk: 22,
    name: "Beverley",
    blurb:
      "Beverley — Avon River crossing. The Beverley Soaring Society is one of the oldest gliding clubs in Australia. If you see circling sailplanes on a summer afternoon, that's them riding thermals off the bare paddocks.",
  },
  {
    slk: 56,
    name: "Brookton",
    blurb:
      "Brookton — junction with Brookton Highway, the back route into Perth. The Old Police Station museum is open by appointment. Ask at the shire office if you want a look through.",
  },
  {
    slk: 86,
    name: "Pingelly",
    blurb:
      "Pingelly — wheatbelt sheep country. The Pingelly Recreation and Cultural Centre hosts the annual Astrofest. Some of the darkest skies in the southwest, only two hours from Perth.",
  },
  {
    slk: 110,
    name: "Narrogin",
    blurb:
      "Narrogin — regional crossroads. Narrogin was the railhead for the Great Southern line, and still has the operational grain pools. Dryandra Forest nearby is one of the last strongholds of the numbat.",
  },
  {
    slk: 144,
    name: "Wagin",
    blurb:
      "Wagin — home of the Giant Ram, a seven-metre fibreglass merino built in 1985. The Wagin Woolorama, held every March, is one of the biggest sheep shows in Western Australia.",
  },
  {
    slk: 188,
    name: "Katanning",
    blurb:
      "Katanning — end of the Great Southern Highway for this trip. Kobeelya was a finishing school for the daughters of pastoralists. The flour mill on Clive Street is being restored as a visitor centre.",
  },
];

const OFFROAD_POIS = [
  {
    name: "Mount Brown Lookout",
    blurb:
      "Mount Brown Lookout, just outside York. Panoramic view of the Avon Valley. Best at sunset when the granite outcrops go orange.",
  },
  {
    name: "Dryandra Forest Settlement",
    blurb:
      "Dryandra Forest Settlement — Barna Mia nocturnal animal sanctuary. Book ahead for the guided spotlight walk to see bilbies, boodies, and woylies.",
  },
];

const CLIPS: SeedClip[] = [
  ...M031_TOWNS.map((t) => ({
    id: `clip-m031-${t.name.toLowerCase().replace(/\s+/g, "-")}`,
    title: t.name,
    script: t.blurb,
  })),
  ...OFFROAD_POIS.map((p) => ({
    id: `clip-poi-${p.name.toLowerCase().replace(/\s+/g, "-")}`,
    title: p.name,
    script: p.blurb,
  })),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateOne(
  zai: Awaited<ReturnType<typeof ZAI.create>>,
  clip: SeedClip,
  outDir: string,
): Promise<void> {
  const outPath = join(outDir, `${clip.id}.wav`);
  if (existsSync(outPath)) {
    console.log(`  [skip] ${clip.id} (already exists)`);
    return;
  }

  // Retry with exponential backoff (the API rate-limits aggressively)
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `  [gen ] ${clip.id} (${clip.script.length} chars)${attempt > 1 ? ` attempt ${attempt}` : ""}...`,
      );
      const response = await zai.audio.tts.create({
        input: clip.script,
        voice: "tongtong",
        speed: 1.0,
        response_format: "wav",
        stream: false,
      });

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(new Uint8Array(arrayBuffer));
      await writeFile(outPath, buffer);
      console.log(`         wrote ${(buffer.length / 1024).toFixed(1)} KB`);
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxRetries && (msg.includes("429") || msg.includes("Too many"))) {
        const backoff = 5000 * attempt;
        console.log(`         rate-limited, backing off ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const outDir = join(import.meta.dir, "..", "public", "audio");
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }

  console.log(`Generating ${CLIPS.length} seed audio clips...`);
  const zai = await ZAI.create();

  let success = 0;
  let failed = 0;

  for (const clip of CLIPS) {
    try {
      await generateOne(zai, clip, outDir);
      success++;
    } catch (err) {
      console.error(`  [fail] ${clip.id}:`, err instanceof Error ? err.message : err);
      failed++;
    }
    // Always wait 2s between clips to avoid rate limits
    await sleep(2000);
  }

  console.log(`\nDone. ${success} succeeded, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
