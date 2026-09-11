import en from "./en.json";
import ua from "./ua.json";

// A tier name followed by a number in the same sentence is the shape of
// "Diamond starts at 3,000 RP" -- a claim that traces to our own
// RANK_PROGRESS_STEPS rather than to KRAFTON, and the one thing this page must
// never print. A measured statement is phrased the other way round ("above 92%
// of players sat at or above 3,000 RP") and names no tier, so it does not match.
//
// Tier names are English in both locales on purpose: the game prints them in
// English and the Ukrainian ladder copy says "Master" too.
const TIER_BAND =
  /(bronze|silver|gold|platinum|crystal|diamond|master|survivor)[^.!?]{0,60}?\d{3}/i;

const strings = (value) =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(strings)
      : [];

const REQUIRED = [
  "title", "intro", "lead",
  "table.heading", "table.above", "table.standingHeader", "table.rpHeader",
  "gathering", "finished", "sample", "platform",
  "lookup.heading", "lookup.label", "lookup.placeholder", "lookup.result",
  "lookup.top", "lookup.blank",
  "method.heading", "method.p1", "method.p2",
  "limits.heading", "limits.p1", "limits.p2", "limits.p3", "limits.p4", "limits.p5",
  "seeRanks", "seeLeaderboards",
];

describe("the rank points page copy", () => {
  it.each([["en", en], ["ua", ua]])("%s defines every key the page calls", (locale, dict) => {
    for (const key of REQUIRED) {
      const text = key.split(".").reduce((node, part) => node?.[part], dict.pages?.rankPoints);
      expect(text, `${locale} pages.rankPoints.${key}`).toBeTruthy();
      expect(typeof text, `${locale} pages.rankPoints.${key}`).toBe("string");
    }
  });

  // The label has no live consumer right now: the top nav is full, so
  // /rank-points is absent from NAV_ORDER and from Navbar's own lists (see the
  // comment on NAV_ORDER for the measurements). It is kept, in both locales and
  // under test, because the route still carries its `nav` label for the day the
  // header is rebuilt -- and a label that exists in one language only is how a
  // half-finished nav entry ships.
  it.each([["en", en], ["ua", ua]])("%s names the page in the menu", (locale, dict) => {
    expect(dict.menu?.rankPoints, `${locale} menu.rankPoints`).toBeTruthy();
  });

  it.each([["en", en], ["ua", ua]])("%s never states a tier's RP floor", (locale, dict) => {
    for (const text of strings(dict.pages?.rankPoints ?? {})) {
      expect(text, `${locale}: ${text}`).not.toMatch(TIER_BAND);
    }
  });

  // Guards the guard: a regex that matched nothing would make the assertion
  // above vacuous.
  it("recognises the sentence it is meant to be refusing", () => {
    expect("Diamond starts at 3,000 RP.").toMatch(TIER_BAND);
    expect("Тір Diamond починається з 3000 RP.").toMatch(TIER_BAND);
    expect("Above 92% of players sat at or above 3,000 RP.").not.toMatch(TIER_BAND);
  });

  // The placeholders the components interpolate. A key that loses one renders
  // the brace literally, which no snapshot test would catch.
  it.each([["en", en], ["ua", ua]])("%s keeps every interpolation", (locale, dict) => {
    const page = dict.pages.rankPoints;
    expect(page.lead).toContain("{rp}");
    expect(page.table.above).toContain("{percent}");
    expect(page.gathering).toContain("{season}");
    expect(page.finished).toContain("{season}");
    expect(page.lookup.result).toContain("{rp}");
    expect(page.lookup.result).toContain("{n}");
    expect(page.lookup.top).toContain("{percent}");
    for (const token of ["{accounts}", "{matches}", "{platform}", "{from}", "{to}"]) {
      expect(page.sample, `${locale} sample ${token}`).toContain(token);
    }
  });
});
