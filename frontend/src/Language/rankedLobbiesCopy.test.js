import en from "./en.json";
import ua from "./ua.json";

// A tier name and a number in the same sentence is the shape of "Diamond
// starts at 3,000 RP" -- a claim that traces to our own RANK_PROGRESS_STEPS
// rather than to KRAFTON, and the one thing this page must never print either,
// even though its own subject is lobby composition rather than RP.
//
// Mirrored so a tier name is caught on either side of the number, the same way
// rankPointsCopy.test.js guards it.
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

// Mirrors the SECTIONS table in RankedLobbies.jsx: method has 2 paragraphs,
// limits has 5. A key list spelled out here rather than derived from the page,
// so a paragraph silently dropped from one dictionary fails this guard instead
// of quietly rendering one language shorter than the other.
const REQUIRED = [
  "title", "intro", "lead",
  "table.heading", "table.tierHeader", "table.cell",
  "tier.bronze", "tier.silver", "tier.gold", "tier.platinum", "tier.crystal",
  "tier.diamond", "tier.master", "tier.survivor", "tier.unranked",
  "gathering", "finished", "sample", "platform",
  "method.heading", "method.p1", "method.p2",
  "limits.heading", "limits.p1", "limits.p2", "limits.p3", "limits.p4", "limits.p5",
  "seeRanks", "seeRankPoints",
];

describe("the ranked lobbies page copy", () => {
  it.each([["en", en], ["ua", ua]])("%s defines every key the page calls", (locale, dict) => {
    for (const key of REQUIRED) {
      const text = key.split(".").reduce((node, part) => node?.[part], dict.pages?.rankedLobbies);
      expect(text, `${locale} pages.rankedLobbies.${key}`).toBeTruthy();
      expect(typeof text, `${locale} pages.rankedLobbies.${key}`).toBe("string");
      // A dictionary entry left as its own dotted key is what a missing
      // translation renders as -- react-switch-lang's translator returns the
      // key verbatim when nothing is registered for it.
      expect(text, `${locale} pages.rankedLobbies.${key}`).not.toBe(`pages.rankedLobbies.${key}`);
    }
  });

  it.each([["en", en], ["ua", ua]])("%s never states a tier's RP floor", (locale, dict) => {
    for (const text of strings(dict.pages?.rankedLobbies ?? {})) {
      expect(text, `${locale}: ${text}`).not.toMatch(TIER_BAND);
    }
  });

  // Guards the guard: a regex that matched nothing would make the assertion
  // above vacuous.
  it("recognises the sentence it is meant to be refusing", () => {
    expect("Diamond starts at 3,000 RP.").toMatch(TIER_BAND);
    expect("Тір Diamond починається з 3000 RP.").toMatch(TIER_BAND);
    expect("3,000 RP puts you in Diamond.").toMatch(TIER_BAND);
    expect("Above 92% of players sat at or above 3,000 RP.").not.toMatch(TIER_BAND);
  });

  // Tier names are the English words in both locales: the game ships no
  // Ukrainian names, players say the English ones, and a transliteration would
  // have to be invented.
  it("names every tier in English in both locales", () => {
    const names = ["Bronze", "Silver", "Gold", "Platinum", "Crystal", "Diamond", "Master", "Survivor", "Unranked"];
    const keys = ["bronze", "silver", "gold", "platinum", "crystal", "diamond", "master", "survivor", "unranked"];
    for (const [key, name] of keys.map((k, i) => [k, names[i]])) {
      expect(en.pages.rankedLobbies.tier[key], `en tier.${key}`).toBe(name);
      expect(ua.pages.rankedLobbies.tier[key], `ua tier.${key}`).toBe(name);
    }
  });

  // The placeholders the components interpolate. A key that loses one renders
  // the brace literally, which no snapshot test would catch.
  it.each([["en", en], ["ua", ua]])("%s keeps every interpolation", (locale, dict) => {
    const page = dict.pages.rankedLobbies;
    expect(page.table.cell, `${locale} table.cell`).toContain("{percent}");
    expect(page.gathering, `${locale} gathering`).toContain("{season}");
    expect(page.finished, `${locale} finished`).toContain("{season}");
    for (const token of ["{accounts}", "{matches}", "{platform}", "{from}", "{to}"]) {
      expect(page.sample, `${locale} sample ${token}`).toContain(token);
    }
  });
});
