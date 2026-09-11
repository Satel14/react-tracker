import { canExportCensusChart, censusChartSvg, censusChartFilename } from "./censusChart";
import en from "../Language/en.json";
import ua from "../Language/ua.json";

const sample = {
  seasonId: "division.bro.official.pc-2018-42",
  current: false,
  shard: "steam",
  accounts: 1000,
  matches: 80,
  firstDate: "2026-09-01",
  lastDate: "2026-09-07",
  tiers: [
    { tier: "gold", publishable: true, share: 0.3, low: 0.28, high: 0.34 },
    { tier: "unranked", publishable: true, share: 0.01, low: 0.005, high: 0.02 },
    { tier: "survivor", publishable: false, share: 0.000123, low: 0, high: 0.001 },
  ],
};
const translate = (dictionary) => (key, values = {}) => {
  const copy = key.split(".").reduce((value, part) => value[part], dictionary);
  return copy.replace(/\{(\w+)\}/g, (_, name) => values[name]);
};
const draw = (data = sample, language = "en") => censusChartSvg(data, {
  language,
  t: translate(language === "ua" ? ua : en),
});

it("keeps the measured shares and confidence bounds without renormalising the visible tiers", () => {
  const svg = draw();
  expect(svg).toContain("30.0%");
  expect(svg).toContain("28.0% – 34.0%");
  expect(svg).toContain("1.0%");
  expect(svg).toContain("Unranked");
  const gold = svg.match(/<g data-tier="gold">(.*?)<\/g>/s)[1];
  expect(Number(gold.match(/<rect[^>]*width="([^"]+)"/)[1])).toBeCloseTo(622.5);
  // 34% is right of the 30% bar but inside the 40% plot boundary at x=1110.
  expect(svg).toContain("H 985.5");
  expect(svg).toContain(">40%</text>");
});

it("withholds unpublished numbers and retains the tier's place in the ladder", () => {
  const svg = draw();
  const survivor = svg.match(/<g data-tier="survivor">(.*?)<\/g>/s)[1];
  expect(survivor).toContain("Insufficient data");
  expect(survivor).not.toContain("%");
  expect(survivor).not.toContain("<rect");
  expect(svg).not.toContain("0.000123");
  expect([...svg.matchAll(/data-tier="([^"]+)"/g)].map((match) => match[1])).toEqual([
    "bronze", "silver", "gold", "platinum", "crystal", "diamond", "master", "survivor", "unranked",
  ]);
});

it.each([
  ["en", "HISTORICAL SAMPLE", "Season 42", "https://www.pubgtracker.top/ranks#distribution"],
  ["ua", "ІСТОРИЧНА ВИБІРКА", "Сезон 42", "https://www.pubgtracker.top/ua/ranks#distribution"],
])("carries the sample identity, source and limitations in %s", (language, status, season, source) => {
  const svg = draw(sample, language);
  expect(svg).toContain(status);
  expect(svg).toContain(season);
  expect(svg).toContain("2026-09-01 – 2026-09-07");
  expect(svg).toContain("PC (Steam)");
  expect(svg).toContain(source);
  expect(svg).toContain("Kakao");
  expect(svg).toContain("95%");
  expect(svg).not.toMatch(/<script|<image|<foreignObject/);
  expect(svg).toContain('width="1600" height="1080"');
});

it.each([
  null,
  { ...sample, tiers: [] },
  { ...sample, tiers: [{ tier: "unranked", publishable: true, share: 1, low: 0.9, high: 1 }] },
  { ...sample, shard: "xbox" },
  { ...sample, seasonId: "" },
  { ...sample, matches: 0 },
  { ...sample, firstDate: "2026-02-30" },
  { ...sample, firstDate: "2026-09-08" },
  { ...sample, tiers: [{ ...sample.tiers[0], share: NaN }] },
  { ...sample, tiers: [{ ...sample.tiers[0], high: 0.29 }] },
  { ...sample, tiers: [{ ...sample.tiers[0], low: -0.1 }] },
  { ...sample, tiers: [sample.tiers[0], sample.tiers[0]] },
])("does not export incomplete or misleading chart data %#", (data) => {
  expect(canExportCensusChart(data)).toBe(false);
  expect(() => draw(data)).toThrow("No exportable census sample");
});

it("keeps translated text inert in standalone SVG", () => {
  const svg = censusChartSvg(sample, { t: () => '<script>alert("test")</script>' });
  expect(svg).not.toContain("<script>");
  expect(svg).toContain("&lt;script&gt;");
});

it("names downloads by measured season and window, independently of the current article season", () => {
  expect(censusChartFilename(sample, "ua", "png")).toBe("pubg-rank-distribution-s42-2026-09-01-2026-09-07-uk.png");
});
