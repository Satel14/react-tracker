import { ARTICLE_SEASON, SEASON_COPY_KEYS } from "./articleSeason";
import { snapshotSeasonNumber, CENSUS_SNAPSHOT } from "./censusSnapshot";
import { routeMetaFor } from "./routeMeta";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

// Every season number the ranks copy prints, in either language. Two things
// that look like one and are not: a patch number, so `(?!\.\d)` keeps "Update
// 42.1" and "оновлення 42.1" out; and a year, so `(?!\s*рок)` keeps the
// Ukrainian "у бета-сезоні 2018 року" out -- the English half of that sentence
// puts the year before the word and never matched.
//
// `\b` after the digits is load-bearing. Without it the engine backtracks to a
// shorter number until the lookahead is happy -- "2018 року" came back as 201,
// and 42.1 would have come back as 4.
const MENTIONS = {
  en: [/Season\s+(\d+)\b(?!\.\d)/g],
  ua: [/сезон\S*\s+(\d+)\b(?!\.\d)(?!\s*(?:рок|р\.))/gi, /(\d+)-(?:й|го|му|м)\s+сезон/gi],
};

const strings = (value) =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(strings)
      : [];

const seasonsNamedIn = (dictionary, locale) =>
  strings(dictionary).flatMap((text) =>
    MENTIONS[locale].flatMap((pattern) =>
      [...text.matchAll(pattern)].map((match) => Number(match[1])),
    ),
  );

// This is the alarm for a season rollover, and it is meant to be loud.
//
// The head strings are built from ARTICLE_SEASON, so they follow it for free.
// The prose cannot: "Season 43 went live on PC on 10 September 2026", the update
// range and the Ranked map pool are statements about that season, and swapping
// the number in them would turn each one into a different, false statement. So
// the number is declared once and the copy is checked against it, and when they
// disagree this test fails and the copy has to be rewritten by someone who knows
// what changed.
//
// Against the census the check is one-directional, and the direction matters. A
// season opens with no samples at all and the census job keeps serving the last
// good reading, so for the first days of every season the article is ahead of
// the table by design -- demanding equality there would turn the alarm on the
// person who did the rewrite on time. Falling BEHIND is the real fault: it means
// the census has been measuring a season the prose never heard of.
describe("the season the ranks article describes", () => {
  it("is never behind the season the census is measuring", () => {
    expect(Number(ARTICLE_SEASON)).toBeGreaterThanOrEqual(
      Number(snapshotSeasonNumber(CENSUS_SNAPSHOT)),
    );
  });

  // What makes the line above safe to loosen. While the two disagree the table
  // has to say which season it measured, and it can only do that honestly if the
  // number reaches it from the snapshot rather than from a translator's fingers.
  it("is not what names the season in the distribution table", () => {
    for (const [locale, dictionary] of [["en", en], ["ua", ua]]) {
      for (const key of ["finished", "gathering"]) {
        const text = dictionary.pages.ranks.distribution[key];
        expect(text, `${locale} distribution.${key} is missing`).toBeTruthy();
        expect(text, `${locale} distribution.${key}`).toContain("{season}");
      }
    }
  });

  it("is the season both heads name", () => {
    for (const path of ["/ranks", "/ua/ranks"]) {
      const route = routeMetaFor(path);
      expect(route.title, `${path} title`).toContain(ARTICLE_SEASON);
      expect(route.description, `${path} description`).toContain(ARTICLE_SEASON);
    }
  });

  it("is the season every piece of copy that names one names", () => {
    expect(SEASON_COPY_KEYS.length).toBeGreaterThan(2);
    for (const key of SEASON_COPY_KEYS) {
      for (const [locale, dictionary] of [["en", en], ["ua", ua]]) {
        const text = key.split(".").reduce((node, part) => node?.[part], dictionary.pages.ranks);
        expect(text, `${locale} pages.ranks.${key} is missing`).toBeTruthy();
        expect(text, `${locale} pages.ranks.${key}`).toContain(ARTICLE_SEASON);
      }
    }
  });

  // Historical seasons are quoted all over this page on purpose -- Ranked
  // launched in 7.2, Crystal arrived in 36.1, the Red Zone changed in 36.2 --
  // so the copy may name any season up to this one. What it may never name is a
  // later one: that is the shape a half-finished season update leaves behind.
  it("is the newest season the copy names", () => {
    for (const [locale, dictionary] of [["en", en], ["ua", ua]]) {
      const named = seasonsNamedIn(dictionary.pages.ranks, locale);
      expect(named.length, `${locale} names no season at all`).toBeGreaterThan(0);
      expect(Math.max(...named), locale).toBe(Number(ARTICLE_SEASON));
    }
  });

  it("finds the season numbers it is meant to be scanning", () => {
    // A pattern that matched nothing would make the assertion above vacuous.
    expect(seasonsNamedIn(en.pages.ranks, "en").length).toBeGreaterThan(2);
    expect(seasonsNamedIn(ua.pages.ranks, "ua").length).toBeGreaterThan(2);
  });

  it("does not read a patch number or a year as a season", () => {
    expect(seasonsNamedIn({ p: "Update 42.1 changed it" }, "en")).toEqual([]);
    expect(seasonsNamedIn({ p: "в оновленні 42.1" }, "ua")).toEqual([]);
    expect(seasonsNamedIn({ p: "у бета-сезоні 2018 року" }, "ua")).toEqual([]);
    expect(seasonsNamedIn({ p: "у 42-му сезоні" }, "ua")).toEqual([42]);
  });
});
