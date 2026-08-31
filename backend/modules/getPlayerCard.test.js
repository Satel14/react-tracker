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

// Every tier the ranked pipeline can produce, in ladder order. Kept here rather
// than imported so the card's palette is pinned against the ladder itself, not
// against whatever the card already happens to know.
const PLAYABLE_TIERS = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "crystal",
  "diamond",
  "master",
  "grandmaster",
  "survivor",
];

const cardFor = async (tier) => {
  rankImpl = async () => ({
    data: {
      ...rankResult.data,
      season: { rankedInfo: { label: tier, tier, currentRankPoint: 2500 } },
    },
  });
  await buildCardPng({ platform: "steam", gameId: "Ninja" });
  return lastSvg;
};

// The fallback in getPlayerCard.js. A real tier reaching it means the card is
// painting the accent green and claiming it is that tier's colour -- which is
// what every Crystal player's share card did, because the palette was written
// before Crystal existed and nothing failed when it was added to the ladder.
const FALLBACK = "#78f7a8";

test("paints every ranked tier in its own colour, never the fallback", async () => {
  for (const tier of PLAYABLE_TIERS) {
    const svg = await cardFor(tier);
    assert.ok(
      !svg.includes(FALLBACK),
      `${tier} fell back to ${FALLBACK} instead of having a colour of its own`,
    );
  }
});

test("still falls back for a tier that is not a tier", async () => {
  assert.ok((await cardFor("")).includes(FALLBACK));
  assert.ok((await cardFor("nonsense")).includes(FALLBACK));
});
