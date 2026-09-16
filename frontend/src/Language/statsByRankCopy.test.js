import en from "./en.json";
import ua from "./ua.json";

// A tier name and a three-digit number in the same sentence is the shape of
// "Diamond starts at 3,000 RP" -- a claim that traces to our own
// RANK_PROGRESS_STEPS rather than to KRAFTON. This page publishes per-tier
// averages and must never publish a rank-point band, which is a different
// number that would read as the same kind of fact.
//
// Mirrored so a tier name is caught on either side of the number, the same way
// rankedLobbiesCopy.test.js and rankPointsCopy.test.js guard it.
const TIER_NAME = "(bronze|silver|gold|platinum|crystal|diamond|master|survivor)";
const TIER_BAND = new RegExp(
  `(?:${TIER_NAME}[^.!?]{0,60}?\\d{3}|\\d{3}[^.!?]{0,60}?${TIER_NAME})`,
  "i",
);

const strings = (value) =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(strings)
      : [];

// Mirrors the SECTIONS table in StatsByRank.jsx: method has 2 paragraphs,
// limits has 5. Spelled out here rather than derived from the page, so a
// paragraph silently dropped from one dictionary fails this guard instead of
// quietly rendering one language shorter than the other.
const REQUIRED = [
  "h1", "intro", "gathering",
  "tier.bronze", "tier.silver", "tier.gold", "tier.platinum", "tier.crystal",
  "tier.diamond", "tier.master", "tier.survivor",
  "table.tier", "table.damage", "table.kills", "table.minutesAlive",
  "table.placement", "table.noKillShare",
  "lookup.label", "lookup.at", "lookup.between", "lookup.above", "lookup.below", "lookup.note",
  "gated", "gatedEntry", "gatedRule", "sample", "tableSample", "platform",
  "method.heading", "method.p1", "method.p2",
  "limits.heading", "limits.p1", "limits.p2", "limits.p3", "limits.p4", "limits.p5",
  "seeRanks", "seeRankedLobbies", "seeRankPoints",
];

describe("the stats by rank page copy", () => {
  it.each([["en", en], ["ua", ua]])("%s defines every key the page calls", (locale, dict) => {
    for (const key of REQUIRED) {
      const text = key.split(".").reduce((node, part) => node?.[part], dict.pages?.statsByRank);
      expect(text, `${locale} pages.statsByRank.${key}`).toBeTruthy();
      expect(typeof text, `${locale} pages.statsByRank.${key}`).toBe("string");
      // A dictionary entry left as its own dotted key is what a missing
      // translation renders as -- react-switch-lang's translator returns the
      // key verbatim when nothing is registered for it.
      expect(text, `${locale} pages.statsByRank.${key}`).not.toBe(`pages.statsByRank.${key}`);
    }
  });

  it.each([["en", en], ["ua", ua]])("%s states no tier's rank-point band", (locale, dict) => {
    for (const text of strings(dict.pages?.statsByRank ?? {})) {
      expect(text, `${locale}: ${text}`).not.toMatch(TIER_BAND);
    }
  });

  // Guards the guard: a regex that matched nothing would make the assertion
  // above vacuous.
  it("recognises the sentence it is meant to be refusing", () => {
    expect("Diamond averages 3,000 RP.").toMatch(TIER_BAND);
    expect("Тір Diamond починається з 3000 RP.").toMatch(TIER_BAND);
    expect("Gold deals 204 damage a match.").toMatch(TIER_BAND);
  });

  // The page's own subject is averages, and RP is the number it must not be
  // read as publishing per tier.
  it.each([["en", en], ["ua", ua]])("%s never writes RP at all", (locale, dict) => {
    for (const text of strings(dict.pages?.statsByRank ?? {})) {
      expect(text, `${locale}: ${text}`).not.toMatch(/\bRP\b/);
    }
  });

  // Tier names are the English words in both locales: the game ships no
  // Ukrainian names, players say the English ones, and a transliteration would
  // have to be invented. Identical to what pages.rankedLobbies.tier already
  // does in both dictionaries.
  it("names every tier in English in both locales", () => {
    const names = {
      bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum",
      crystal: "Crystal", diamond: "Diamond", master: "Master", survivor: "Survivor",
    };
    for (const [key, name] of Object.entries(names)) {
      expect(en.pages.statsByRank.tier[key], `en tier.${key}`).toBe(name);
      expect(ua.pages.statsByRank.tier[key], `ua tier.${key}`).toBe(name);
    }
  });

  // No unranked row. "What does an unplaced player do in a match" is a question
  // about the days after a reset, and benchmarks.js drops that bucket before it
  // ever reaches this page -- so a key for it would be copy for a row that
  // cannot exist.
  it("has no unranked tier name to render", () => {
    expect(en.pages.statsByRank.tier.unranked).toBeUndefined();
    expect(ua.pages.statsByRank.tier.unranked).toBeUndefined();
  });

  // The placeholders the page interpolates. A key that loses one renders the
  // brace literally, which no snapshot test would catch.
  it.each([["en", en], ["ua", ua]])("%s keeps every interpolation", (locale, dict) => {
    const page = dict.pages.statsByRank;
    for (const token of ["{accounts}", "{matches}", "{platform}", "{from}", "{to}"]) {
      expect(page.sample, `${locale} sample ${token}`).toContain(token);
    }
    for (const token of ["{tier}", "{accounts}"]) {
      expect(page.gatedEntry, `${locale} gatedEntry ${token}`).toContain(token);
    }
    expect(page.tableSample, `${locale} tableSample {benchmarkAccounts}`).toContain("{benchmarkAccounts}");
  });

  // In the gathering state the snapshot on the page is by definition the
  // ARCHIVED season, never the one being collected, so there is no correct
  // number to print. It shipped naming one once already.
  it.each([["en", en], ["ua", ua]])("%s names no season in the gathering copy", (locale, dict) => {
    const text = dict.pages.statsByRank.gathering;
    expect(text, `${locale} gathering`).not.toContain("{season}");
    expect(text, `${locale} gathering`).not.toMatch(/\d/);
  });
});
