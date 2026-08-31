// Renders the site's share card: backend/scripts/og-card.svg -> frontend/public/og.png.
//
// It lives in backend/ because @resvg/resvg-js is a backend dependency (the same
// one behind modules/getPlayerCard.js); the frontend has no rasteriser. Run it
// from anywhere after `npm ci` in backend/:
//
//   node backend/scripts/render-og-card.mjs
//
// One-off, not part of any build. The PNG is committed, so this only needs to run
// when the card art changes -- and the SVG beside it is why that stays possible.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Resvg } = require("@resvg/resvg-js");

const WIDTH = 1200;
const HEIGHT = 630;

const svgPath = fileURLToPath(new URL("./og-card.svg", import.meta.url));
const outPath = fileURLToPath(new URL("../../frontend/public/og.png", import.meta.url));

const resvg = new Resvg(readFileSync(svgPath, "utf8"), {
  fitTo: { mode: "width", value: WIDTH },
  font: { loadSystemFonts: true },
});

const png = resvg.render();
if (png.width !== WIDTH || png.height !== HEIGHT) {
  // The meta tags in index.html state these numbers and a test asserts the PNG
  // matches them, so a drifting viewBox should stop here, not there.
  throw new Error(`expected ${WIDTH}x${HEIGHT}, rendered ${png.width}x${png.height}`);
}

writeFileSync(outPath, png.asPng());
console.log(`wrote ${outPath} (${png.width}x${png.height})`);
