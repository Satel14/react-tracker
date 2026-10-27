import { describe, it, expect } from "vitest";
import { seasonRecapSvg, seasonRecapFilename, RECAP_CARD_WIDTH, RECAP_CARD_HEIGHT } from "./seasonRecapCard";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const translate = (dictionary) => (key, values = {}) => {
  const copy = key.split(".").reduce((value, part) => value[part], dictionary);
  return copy.replace(/\{(\w+)\}/g, (_, name) => values[name]);
};

const recap = (overrides = {}) => ({
  seasonId: "division.bro.official.pc-2018-43",
  season: 43,
  finished: true,
  tier: "platinum",
  tierLabel: "Platinum II",
  rankPoint: 2450,
  peakRankPoint: 2610,
  ranked: { matches: 138, wins: 9, top10Rate: 41.3, kd: 2.1, avgDamage: 312, avgPlace: 9.4 },
  records: { mostKills: 11, longestKill: 512.4 },
  ...overrides,
});

const draw = (data = recap(), { language = "en", playerName = "WhiteChaseSmoker", platform = "steam", percentile = 72 } = {}) =>
  seasonRecapSvg(data, { language, playerName, platform, percentile, t: translate(language === "ua" ? ua : en) });

const text = (svg) => svg.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("seasonRecapSvg", () => {
  it("is a 1200×630 image, the size link previews and chats expect", () => {
    expect(RECAP_CARD_WIDTH).toBe(1200);
    expect(RECAP_CARD_HEIGHT).toBe(630);
    expect(draw()).toMatch(/^<svg[^>]+width="1200" height="630"/);
  });

  // Rasterised from a blob: an SVG used as an image may not fetch anything,
  // and a remote font or picture would taint the canvas it is drawn on.
  it("is self-contained", () => {
    const svg = draw();
    expect(svg).not.toMatch(/<image|href=|url\(|@import|<script/i);
  });

  it("carries the player, the season, the rank and the numbers", () => {
    const words = text(draw());
    expect(words).toContain("WhiteChaseSmoker");
    expect(words).toContain("Season 43 · final");
    expect(words).toContain("Platinum II");
    expect(words).toContain("2,450 RP");
    expect(words).toContain("Season high 2,610 RP");
    expect(words).toContain("Better than 72 out of 100 ranked players");
    for (const value of ["138", "9", "41%", "2.10", "312", "9.4", "11", "512 m"]) {
      expect(words).toContain(value);
    }
    expect(words).toContain("pubgtracker.top");
  });

  it("says so far while the season runs", () => {
    expect(text(draw(recap({ finished: false })))).toContain("Season 43 so far");
  });

  it("formats numbers the way the language writes them", () => {
    const words = text(draw(recap(), { language: "ua" }));
    expect(words).toContain(`${new Intl.NumberFormat("uk-UA").format(2450)} RP`.replace(/\s+/g, " "));
    expect(words).toContain("2,10");
    expect(words).toContain("Сезон 43 · підсумки");
  });

  it("escapes the player name", () => {
    const svg = draw(recap(), { playerName: `<b>&"Co'` });
    expect(svg).toContain("&lt;b&gt;&amp;&quot;Co&apos;");
    expect(svg).not.toContain("<b>");
  });

  it("leaves out what is not there rather than printing a zero", () => {
    const bare = draw(recap({ peakRankPoint: null, records: { mostKills: null, longestKill: null } }), { percentile: null });
    const words = text(bare);
    expect(words).not.toContain("Season high");
    expect(words).not.toContain("Better than");
    expect(words).not.toContain(en.pages.player.recap.records);
  });

  it("shows an unknown number as a dash", () => {
    const words = text(draw(recap({ ranked: { ...recap().ranked, kd: null } })));
    expect(words).toMatch(/K\/D —/);
  });
});

describe("seasonRecapFilename", () => {
  it("names the season, the player and the language, with nothing a file system minds", () => {
    expect(seasonRecapFilename(recap(), "Bravo.exe/1", "ua")).toBe("pubg-season-43-Bravo-exe-1-uk.png");
    expect(seasonRecapFilename(recap(), "Someone", "en")).toBe("pubg-season-43-Someone-en.png");
  });
});
