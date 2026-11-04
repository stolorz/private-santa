/**
 * Rasterise `public/icon.svg` into the PNG sizes the app already serves:
 * Android / favicon (`android.png`) and Apple touch (`ios.png`).
 *
 *   npm run icons
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PUBLIC_DIR = path.join(process.cwd(), "public");

const OUTPUTS = [
  { file: "android.png", size: 192 },
  { file: "ios.png", size: 512 },
] as const;

async function render(svg: Buffer, file: string, size: number) {
  const data = await sharp(svg)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
  const dest = path.join(PUBLIC_DIR, file);
  await writeFile(dest, data);
  console.log(
    `${path.relative(process.cwd(), dest)} (${size}×${size}, ${Math.round(data.length / 1024)} KB)`,
  );
}

const svg = await readFile(path.join(PUBLIC_DIR, "icon.svg"));
for (const { file, size } of OUTPUTS) {
  await render(svg, file, size);
}
