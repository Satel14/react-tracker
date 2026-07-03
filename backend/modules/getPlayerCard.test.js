const { test } = require("node:test");
const assert = require("node:assert/strict");

// Mock ./getPlayerRank BEFORE requiring the module under test so the real PUBG
// pipeline (env vars + network) never loads. getPlayerCard destructures
// parsePlayerRank at require time, so delegate through a mutable rankImpl.
let rankImpl;
const grPath = require.resolve("./getPlayerRank");
require.cache[grPath] = {
  id: grPath,
  filename: grPath,
  loaded: true,
  exports: { parsePlayerRank: (...args) => rankImpl(...args) },
};

// Stub the native SVG->PNG renderer: deterministic output + capture the SVG
// that buildCardPng feeds it, so we can prove the real player object reached buildSvg.
let lastSvg = null;
const resvgPath = require.resolve("@resvg/resvg-js");
require.cache[resvgPath] = {
  id: resvgPath,
  filename: resvgPath,
  loaded: true,
  exports: {
    Resvg: class {
      constructor(svg) { lastSvg = svg; }
      render() { return { asPng: () => Buffer.from("PNGDATA") }; }
    },
  },
};

const { buildCardPng } = require("./getPlayerCard");

// The real shape parsePlayerRank resolves to: an { data } envelope.
const rankResult = {
  data: {
    platformInfo: { platformUserHandle: "Ninja", platformSlug: "steam" },
    segments: [{
      stats: {
        kd: { displayValue: "3.14" },
        wlPercentage: { displayValue: "12%" },
        avgDamage: { displayValue: "250" },
        matchesPlayed: { displayValue: "99" },
      },
    }],
    season: { rankedInfo: { label: "Diamond", tier: "diamond", currentRankPoint: 4200 } },
  },
};

test("buildCardPng unwraps parsePlayerRank's { data } envelope and renders a PNG", async () => {
  rankImpl = async () => rankResult;
  const png = await buildCardPng({ platform: "steam", gameId: "Ninja" });
  assert.ok(Buffer.isBuffer(png));
  assert.equal(png.toString(), "PNGDATA");
  // Proves the inner player (with platformInfo) — not the envelope — reached buildSvg.
  assert.match(lastSvg, /Ninja/);
  assert.match(lastSvg, /Diamond/);
});

test("buildCardPng throws 'Player not found' when parsePlayerRank yields nothing", async () => {
  rankImpl = async () => null;
  await assert.rejects(
    buildCardPng({ platform: "steam", gameId: "Nobody" }),
    /Player not found/
  );
});

test("buildCardPng throws 'Player not found' when the envelope lacks platformInfo", async () => {
  rankImpl = async () => ({ data: { segments: [], season: {} } });
  await assert.rejects(
    buildCardPng({ platform: "steam", gameId: "Ghost" }),
    /Player not found/
  );
});
