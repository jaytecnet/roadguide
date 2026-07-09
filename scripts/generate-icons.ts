/**
 * Generate PNG icons at multiple sizes from the SVG source.
 * Run once via `bun run scripts/generate-icons.ts`.
 */
import sharp from "sharp";
import { readFile } from "fs/promises";
import { join } from "path";

const SIZES = [96, 128, 192, 256, 384, 512];
const PUBLIC_DIR = join(import.meta.dir, "..", "public");

async function main() {
  const svg = await readFile(join(PUBLIC_DIR, "icon.svg"));

  for (const size of SIZES) {
    const outPath = join(PUBLIC_DIR, `icon-${size}.png`);
    await sharp(svg, { density: 384 })
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);
    console.log(`Generated: icon-${size}.png`);
  }

  // Apple touch icon (180x180, no transparency)
  await sharp(svg, { density: 384 })
    .resize(180, 180, { fit: "cover" })
    .flatten({ background: "#1c1917" })
    .png()
    .toFile(join(PUBLIC_DIR, "apple-touch-icon.png"));
  console.log("Generated: apple-touch-icon.png");

  // Favicon (32x32)
  await sharp(svg, { density: 384 })
    .resize(32, 32, { fit: "contain" })
    .png()
    .toFile(join(PUBLIC_DIR, "favicon-32.png"));
  console.log("Generated: favicon-32.png");

  console.log("\nAll icons generated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
