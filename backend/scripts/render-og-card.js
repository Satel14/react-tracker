// Renders the site's share card: backend/scripts/og-card.svg -> frontend/public/og.png.
//
// It lives in backend/ because @resvg/resvg-js is a backend dependency (the same
// one behind modules/getPlayerCard.js); the frontend has no rasteriser. Run it
// after `npm ci` in backend/:
//
//   node backend/scripts/render-og-card.js
//
// One-off, not part of any build. The PNG is committed, so this only needs to run
// when the card art changes -- and the SVG beside it is why that stays possible.
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { Resvg } = require("@resvg/resvg-js");

const WIDTH = 1200;
const HEIGHT = 630;

const svgPath = join(__dirname, "og-card.svg");
const outPath = join(__dirname, "..", "..", "frontend", "public", "og.png");

const resvg = new Resvg(readFileSync(svgPath, "utf8"), {
  fitTo: { mode: "width", value: WIDTH },
  font: { loadSystemFonts: true },
});

const rendered = resvg.render();
if (rendered.width !== WIDTH || rendered.height !== HEIGHT) {
  // index.html states these numbers and a frontend test asserts the PNG matches
  // them, so a drifting viewBox should stop here rather than there.
  throw new Error(`expected ${WIDTH}x${HEIGHT}, rendered ${rendered.width}x${rendered.height}`);
}

writeFileSync(outPath, rendered.asPng());
console.log(`wrote ${outPath} (${rendered.width}x${rendered.height})`);
