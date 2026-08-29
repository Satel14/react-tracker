// One-off generator for frontend/public/map-hi/*.webp.
// Usage: npm i --no-save sharp && node scripts/build-map-rasters.mjs && npm un sharp
/* global fetch, Buffer, console */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const BASE = "https://media.githubusercontent.com/media/pubg/api-assets/master/Assets/Maps";
const OUT = path.resolve("public/map-hi");
// Both tiers come from the same 8192px source, so each is a downsample. Pass a
// size on the command line to build just one: `node build-map-rasters.mjs 4096`.
const SIZES = process.argv[2] ? [Number(process.argv[2])] : [2048, 4096];
const QUALITY = 82;

const MAPS = [
  ["Erangel_Main", "erangel"],
  ["Miramar_Main", "miramar"],
  ["Taego_Main", "taego"],
  ["Deston_Main", "deston"],
  ["Rondo_Main", "rondo"],
  ["Vikendi_Main", "vikendi"],
  ["Sanhok_Main", "sanhok"],
  ["Paramo_Main", "paramo"],
  ["Karakin_Main", "karakin"],
  ["Camp_Jackal_Main", "camp_jackal"],
  ["Haven_Main", "haven"],
];

const sniff = (buf) => {
  if (buf[0] === 0x89 && buf[1] === 0x50) return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  return "unknown";
};

await mkdir(OUT, { recursive: true });

for (const [asset, slug] of MAPS) {
  const url = `${BASE}/${asset}_High_Res.png`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${asset}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(`${slug}: ${(buf.length / 1e6).toFixed(1)} MB, sniffed ${sniff(buf)}`);

  // Decode once, emit every requested tier from it.
  const img = sharp(buf, { limitInputPixels: false });
  const { hasAlpha } = await img.metadata();
  for (const size of SIZES) {
    const out = await img
      .clone()
      .resize(size, size, { kernel: "lanczos3", fit: "fill" })
      .webp({ quality: QUALITY, effort: 6, alphaQuality: 100 })
      .toBuffer();

    const file = path.join(OUT, `${slug}-${size}.v1.webp`);
    await writeFile(file, out);
    console.log(`  -> ${file} ${(out.length / 1024).toFixed(0)} KB${hasAlpha ? " (alpha preserved)" : ""}`);
  }
}
